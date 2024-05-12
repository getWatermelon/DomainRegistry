// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {DomainHolderRewards} from "../libraries/DomainHolderRewards.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {strings} from "solidity-stringutils/src/strings.sol";

/**
* @title Domain Registry Contract
* @notice This contract allows users to register and manage top-level domain names
* @author Developed by Ivan Myasoyedov
*/
contract DomainRegistryV2 is OwnableUpgradeable {
    using strings for *;
    using DomainHolderRewards for DomainHolderRewards.RewardsStorage;

    // keccak256(abi.encode(uint256(keccak256("main.DomainRegistry.storage")) - 1)) & ~bytes32(uint256(0xff));
    bytes32 private constant DomainRegistryStorageLocation =
        0xb611e20da8e0f23a29d564e0e10e4725f38cca3e24b5e476e1c2af79291d8a00;

    /// @custom:storage-location erc7201:main.DomainRegistry.storage
    struct DomainRegistryStorage {
        /// @notice Fee required to register a domain in USDT
        uint256 registrationFee;

        /// @dev Mapping from domain name to its holder address
        mapping(string domainName => address payable holderAddress) domainToHolder;

        /// @notice Store the reward per domain holder in USDT
        uint256 domainHolderReward;

        /// @notice Store the Ethereum rewards for Domain Holders
        DomainHolderRewards.RewardsStorage ethRewardStorage;

        /// @notice Store the USDT rewards for Domain Holders
        DomainHolderRewards.RewardsStorage usdtRewardStorage;

        /// @notice ERC20 contract instance representing the USDT token used for transactions.
        ERC20 USDTContract;

        /// @notice Chainlink Aggregator Interface instance providing access to latest ETH to USDT price info.
        AggregatorV3Interface USDTToEHTPriceFeed;
    }

    /// @notice Emitted when a new domain is registered
    event DomainRegistered(string domain, address indexed domainHolder);

    /// @notice Emitted when the registration fee is changed
    event RegistrationFeeChanged(uint256 newRegistrationFee);

    /// @notice Emitted when a domain holder is rewarded
    event DomainHolderRewarded(
        string domain,
        address indexed domainHolder,
        string currencyType,
        uint256 rewardValue,
        uint256 rewardBalance
    );

    /// @notice Emitted when a domain holder withdraws his reward
    event DomainHolderRewardWithdrawn(
        address indexed domainHolder,
        uint256 rewardValue
    );

    /// @notice Emitted when the domain holder reward changes
    event DomainHolderRewardChanged(uint256 newRegistrationFee);

    /// @dev Error thrown when trying to register a domain that is already registered
    error DomainAlreadyRegistered(string domain);

    /// @dev Error thrown when the registration fee is set to zero or less
    error RegistrationFeeMustBeGreaterThanZero();

    /// @dev Error thrown when the new registration fee is the same as the current fee
    error NewRegistrationFeeMustDifferFromCurrent();

    /// @dev Error thrown when the provided registration fee does not match the required fee
    error IncorrectRegistrationFee(uint256 requiredFee);

    /// @dev Error thrown when withdrawing fees fails
    error FailedToWithdrawFees();

    /// @dev Error thrown when nothing to withdraw as domain has no pending rewards
    error NothingToWithdraw();

    /// @dev Error thrown when a domain is not yet registered
    error DomainWasNotRegistered();

    /// @dev Error thrown when domain holder reward must be greater than zero
    error DomainHolderRewardMustBeGreaterThanZero();

    /// @dev Error thrown when new domain holder reward must differ from current reward
    error NewDomainHolderRewardMustDifferFromCurrent();

    /// @dev Error thrown when a domain holder's withdraw reward fails
    error WithdrawRewardFailed(address holderAddress);

    /// @dev Error thrown when the caller is neither the domain holder or the contract owner
    error NotDomainHolderOrOwner();

    /// @dev Error thrown when there is not enough USDT balance
    error NotEnoughUSDT(uint256 requiredUSDTAmount);

    /// @dev Error thrown when the USDT transfer operation failed
    error FailedToTransferUSDT(address senderAddress);

    /// @notice Ensures that a domain is not already registered before running the function
    modifier availableDomain(string memory _domain) {
        if (isDomainRegistered(_domain))
            revert DomainAlreadyRegistered(_domain);
        _;
    }

    /// @notice Ensures that a domain is registered before running the function
    modifier onlyRegisteredDomain(string memory _domain) {
        if (!isDomainRegistered(_domain))
            revert DomainWasNotRegistered();
        _;
    }

    /// @notice Ensures that a function can only be called by the domain holder or the contract owner.
    modifier onlyDomainHolderOrOwner(string memory _domain) {
        address domainHolder = getDomainHolder(_domain);

        if (!(msg.sender == domainHolder || msg.sender == owner())) {
            revert NotDomainHolderOrOwner();
        }
        _;
    }

    /// @notice Reinitialize the contract with new owner, registration fee and holder reward
    function reinitialize(
        address _owner,
        uint256 _registrationFee,
        uint256 _domainHolderReward,
        address _usdtContractAddress,
        address _USDTToETHPriceFeedContractAddress
    )
        public
        reinitializer(2)
    {
        if (_registrationFee <= 0) revert RegistrationFeeMustBeGreaterThanZero();
        if (_domainHolderReward <= 0) revert DomainHolderRewardMustBeGreaterThanZero();

        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        __Ownable_init(_owner);
        $.registrationFee = _registrationFee;
        $.domainHolderReward = _domainHolderReward;

        $.USDTContract = ERC20(_usdtContractAddress);
        $.USDTToEHTPriceFeed = AggregatorV3Interface(_USDTToETHPriceFeedContractAddress);

        $.ethRewardStorage.currencyType = "ETH";
        $.usdtRewardStorage.currencyType = "USDT";
    }

    /**
    * @notice Retrieves the fee required to register a domain
    * @return The registration fee for a domain
    */
    function registrationFeeInUSDT() external view returns (uint256) {
        return _getDomainRegistryStorage().registrationFee;
    }

    /// @notice Get the reward amount set for domain holders
    function domainHolderRewardInUSDT() external view returns (uint256) {
        return _getDomainRegistryStorage().domainHolderReward;
    }

    /**
    * @notice Registers a new domain by paying the fee in ERC20 compliant USDT tokens.
    * @dev Emits a DomainRegistered event upon success
    * @param _domain The domain name to register
    */
    function registerDomainWithUSDT(string calldata _domain) payable external availableDomain(_domain) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        if ($.USDTContract.balanceOf(msg.sender) < $.registrationFee) revert NotEnoughUSDT($.registrationFee);

        _registerDomain(_domain, msg.sender);
        _applyRewardToParentDomainHolder($.usdtRewardStorage, _domain, $.domainHolderReward);

        bool success = $.USDTContract.transferFrom(msg.sender, address(this), $.registrationFee);
        if (!success) revert FailedToTransferUSDT(msg.sender);
    }

    /**
    * @notice Registers a new top-level domain
    * @dev Emits a DomainRegistered event upon success
    * @param _domain The domain name to register
    */
    function registerDomainWithETH(string calldata _domain) payable external availableDomain(_domain) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        uint256 feeInWei = registrationFeeInETH();
        if (msg.value != feeInWei) revert IncorrectRegistrationFee(feeInWei);

        _registerDomain(_domain, msg.sender);
        _applyRewardToParentDomainHolder($.ethRewardStorage, _domain, domainHolderRewardInETH());
    }

    /**
    * @notice Changes the registration fee for domain registration
    * @dev Emits a RegistrationFeeChanged event upon success
    * @param _newFee The new fee for registering a domain
    */
    function changeRegistrationFee(uint256 _newFee) external onlyOwner {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        if (_newFee <= 0) revert RegistrationFeeMustBeGreaterThanZero();
        if (_newFee == $.registrationFee) revert NewRegistrationFeeMustDifferFromCurrent();

        $.registrationFee = _newFee;
        emit RegistrationFeeChanged(_newFee);
    }

    /// @notice Change the reward amount for domain holders
    function changeDomainHolderReward(uint256 _newRewardAmount) external onlyOwner {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        if (_newRewardAmount <= 0) revert DomainHolderRewardMustBeGreaterThanZero();
        if (_newRewardAmount == $.domainHolderReward) revert NewDomainHolderRewardMustDifferFromCurrent();

        $.domainHolderReward = _newRewardAmount;
        emit DomainHolderRewardChanged(_newRewardAmount);
    }

    /**
    * @notice Withdraws the collected registration fees to the owner's address
    * @dev Can only be called by the contract owner
    */
    function withdrawFeesInETH() external onlyOwner {
        uint256 feeAmountToWithdraw =
            address(this).balance - _getDomainRegistryStorage().ethRewardStorage.getTotalRewardAmount();

        bool success = _transferEther(payable(owner()), feeAmountToWithdraw);
        if (!success) revert FailedToWithdrawFees();
    }

    /**
    * @notice Initiates a withdrawal operation for all the accumulated USDT fees,
    * transferring it to the contract's owner
    * @dev Can only be called by the contract owner
    */
    function withdrawFeesInUSDT() external onlyOwner {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        uint256 contractUSDTTokenBalance = $.USDTContract.balanceOf(address(this));
        uint256 totalUSDTRewards = $.usdtRewardStorage.totalRewardsAmount;
        uint256 rewardBalance = contractUSDTTokenBalance - totalUSDTRewards;

        if (rewardBalance == 0) revert NothingToWithdraw();

        bool success = _transferUSDT(address(this), owner(), rewardBalance);
        if (!success) revert FailedToWithdrawFees();
    }

    /**
    * @notice Allows the domain holder to withdraw their ETH reward
    * @dev This function sends the ETH reward for the sender's address,
    * emits a DomainHolderRewardWithdrawn event, and transfers the ETH reward to the sender's address
    */
    function withdrawDomainHolderRewardInETH() external {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        address domainHolder = msg.sender;
        uint256 rewardBalance = $.ethRewardStorage.getAddressRewardAmount(domainHolder);

        if (rewardBalance == 0) revert NothingToWithdraw();

        $.ethRewardStorage.resetRewardForAddress(domainHolder);

        emit DomainHolderRewardWithdrawn({
            domainHolder: domainHolder,
            rewardValue: $.domainHolderReward
        });

        bool success = _transferEther(payable(domainHolder), rewardBalance);
        if (!success) revert WithdrawRewardFailed(domainHolder);
    }

    /**
    * @notice Allows the domain holder to withdraw their USDT reward
    * @dev This function sends the USDT reward for the sender's address,
    * emits a DomainHolderRewardWithdrawn event, and transfers the USDT reward to the sender's address
    */
    function withdrawDomainHolderRewardInUSDT() external {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        address domainHolder = msg.sender;
        uint256 rewardBalance = $.usdtRewardStorage.getAddressRewardAmount(domainHolder);

        if (rewardBalance == 0) revert NothingToWithdraw();

        $.usdtRewardStorage.resetRewardForAddress(domainHolder);

        emit DomainHolderRewardWithdrawn({
            domainHolder: domainHolder,
            rewardValue: $.domainHolderReward
        });

        bool success = _transferUSDT(address(this), domainHolder, rewardBalance);
        if (!success) revert WithdrawRewardFailed(domainHolder);
    }

    /// @notice Checks whether a domain is registered
    function isDomainRegistered(string memory _domain) public view returns (bool)
    {
        return _getDomainRegistryStorage().domainToHolder[_domain] != address(0x0);
    }

    /**
    * @notice Retrieves the current domain registration fee in terms of Ether (ETH).
    * @return The registration fee in Wei.
    */
    function registrationFeeInETH() public view returns (uint256) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();
        uint256 registrationFeeInWei = _convertUSDTToWEI($.registrationFee);

        return registrationFeeInWei;
    }

    /**
    * @notice Retrieves the current domain holder reward in terms of Ether (ETH).
    * @return The domain holder reward in Wei.
    */
    function domainHolderRewardInETH() public view returns (uint256) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();
        uint256 domainHolderRewardInWei = _convertUSDTToWEI($.domainHolderReward);

        return domainHolderRewardInWei;
    }

    /**
    * @notice Retrieves the reward amount for a specific domain holder.
    * @param _holderAddress The address of the domain holder.
    * @return The amount of reward for the provided address.
    */
    function getAddressRewardAmountInETH(address _holderAddress) public view returns (uint256) {
        return _getDomainRegistryStorage().ethRewardStorage.getAddressRewardAmount(_holderAddress);
    }

    /**
    * @notice Retrieves the current reward amount a specific address holder can claim, in USDT.
    * @param _holderAddress The address of the domain holder.
    * @return The amount of reward for the provided address.
    */
    function getAddressRewardAmountInUSDT(address _holderAddress) public view returns (uint256) {
        return _getDomainRegistryStorage().usdtRewardStorage.getAddressRewardAmount(_holderAddress);
    }

    /**
    * @notice Get the holders of a domain.
    * @param _domain The domain to retrieve the holder for.
    * @return The address of the holder of the given domain.
    */
    function getDomainHolder(string memory _domain)
        public
        view
        onlyRegisteredDomain(_domain)
        returns (address)
    {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();
        return $.domainToHolder[_domain];
    }

    /// @notice Apply rewards to the domain holder
    function _applyRewardToParentDomainHolder(
        DomainHolderRewards.RewardsStorage storage _rewardsStorage,
        string memory _domain,
        uint256 _domainHolderReward
    )
        private
    {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        strings.slice memory domainNameSlice = _domain.toSlice();
        strings.slice memory delimiter = ".".toSlice();

        while (!domainNameSlice.empty()) {
            domainNameSlice = domainNameSlice.find(delimiter).beyond(delimiter);
            string memory parentDomainName = domainNameSlice.toString();

            if (isDomainRegistered(parentDomainName)) {
                address payable domainHolderAddress = $.domainToHolder[parentDomainName];

                emit DomainHolderRewarded({
                    domain: parentDomainName,
                    domainHolder: domainHolderAddress,
                    currencyType: _rewardsStorage.currencyType,
                    rewardValue: _domainHolderReward,
                    rewardBalance: _rewardsStorage.getAddressRewardAmount(domainHolderAddress)
                });

                _rewardsStorage.applyRewardForAddress(domainHolderAddress, _domainHolderReward);
                break;
            }
        }
    }

    /**
    * @dev Helper function to convert a USDT amount to Wei by utilizing the current USD to ETH conversion rate
    * @param usdtValue The registration fee in USDT.
    * @return The registration fee in Wei.
    */
    function _convertUSDTToWEI(uint256 usdtValue) private view returns (uint256) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        uint8 usdtDecimals = $.USDTContract.decimals();
        uint8 ethUsdDecimals = $.USDTToEHTPriceFeed.decimals();

        uint256 usdtToEthRate = _getLatestUSDTToETHPrice();
        uint256 normalizedEthPrice = uint256(usdtToEthRate) * (10 ** usdtDecimals) / (10 ** ethUsdDecimals);

        uint256 weiAmount = usdtValue * 1e18 / normalizedEthPrice;
        return weiAmount;
    }

    /**
    * @dev Helper function to retrieve the latest USDT to ETH conversion price from the USDTToEHTPriceFeed.
    * @return The latest USD to ETH conversion price
    */
    function _getLatestUSDTToETHPrice() private view returns (uint256) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();
        (, int256 price, , ,) = $.USDTToEHTPriceFeed.latestRoundData();

        return uint256(price);
    }

    /**
    * @dev Helper function to initiate the registration of a domain.
    * @param _domain The domain name to register
    * @param _address The holder address to register the domain to
    */
    function _registerDomain(string calldata _domain, address _address) private {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        $.domainToHolder[_domain] = payable(_address);
        emit DomainRegistered(_domain, _address);
    }

    /**
    * @notice Handles the internal USDT transfer operation from one address to another
    * @dev First approves the amount to be transferred, then tries to initiate the transfer
    * @param _sender The address of the sender
    * @param _receiver The address of the receiver
    * @param _amount The amount of USDT to be transferred
    * @return The status of the operation, true if the transaction was successful, false otherwise
    */
    function _transferUSDT(address _sender, address _receiver, uint256 _amount) private returns (bool) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        bool approve = $.USDTContract.approve(_sender, _amount);
        bool success = $.USDTContract.transferFrom(_sender, _receiver, _amount);

        return approve && success;
    }

    /// @notice Transfer Ether to a given address
    function _transferEther(address payable _address, uint256 _amount) private returns (bool) {
        (bool success, ) = _address.call{value: _amount}("");
        return success;
    }

    /**
    * @dev Retrieves the DomainRegistryStorage instance from its specified slot in storage.
    * This function uses inline assembly to directly access storage slot.
    * @return $ An instance of DomainRegistryStorage struct from its slot in storage
    */
    function _getDomainRegistryStorage() private pure returns (DomainRegistryStorage storage $) {
        assembly {
            $.slot := DomainRegistryStorageLocation
        }
    }
}
