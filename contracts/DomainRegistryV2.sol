// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "solidity-stringutils/src/strings.sol";

/**
* @title Domain Registry Contract
* @notice This contract allows users to register and manage top-level domain names
* @author Developed by Ivan Myasoyedov
*/
contract DomainRegistryV2 is OwnableUpgradeable {
    using strings for *;

    // keccak256(abi.encode(uint256(keccak256("main.DomainRegistry.storage")) - 1)) & ~bytes32(uint256(0xff));
    bytes32 private constant DomainRegistryStorageLocation =
        0xb611e20da8e0f23a29d564e0e10e4725f38cca3e24b5e476e1c2af79291d8a00;

    /// @custom:storage-location erc7201:main.DomainRegistry.storage
    struct DomainRegistryStorage {
        /// @notice Fee required to register a domain
        uint256 registrationFee;

        /// @dev Mapping from domain name to its holder address
        mapping(string => address payable) domainToHolder;

        /// @notice Store the reward per domain holder
        uint256 domainHolderReward;

        /// @notice Mapping from domain name to its rewards
        mapping(string => uint256) domainToReward;

        /// @notice Total amount of rewards for all domains
        uint256 totalDomainRewardsAmount;
    }

    /// @notice Emitted when a new domain is registered
    event DomainRegistered(string domain, address indexed controller);

    /// @notice Emitted when the registration fee is changed
    event RegistrationFeeChanged(uint256 newRegistrationFee);

    /// @notice Emitted when a domain holder is rewarded
    event DomainHolderRewarded(
        string domain,
        address indexed controller,
        uint256 rewardValue,
        uint256 rewardBalance
    );

    /// @notice Emitted when a domain holder withdraws his reward
    event DomainHolderRewardWithdrawn(
        string domain,
        address indexed controller,
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
    error WithdrawRewardFailed(string domain);

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

    /// @notice Reinitialize the contract with new owner, registration fee and holder reward
    function reinitialize(address _owner, uint256 _registrationFee, uint256 _domainHolderReward)
    public
    reinitializer(2) {
        if (_registrationFee <= 0) revert RegistrationFeeMustBeGreaterThanZero();
        if (_domainHolderReward <= 0) revert DomainHolderRewardMustBeGreaterThanZero();

        __Ownable_init(_owner);
        _getDomainRegistryStorage().registrationFee = _registrationFee;
        _getDomainRegistryStorage().domainHolderReward = _domainHolderReward;
    }

    /**
    * @notice This function is triggered when the contract receives plain Ether (without data)
    */
    receive() external payable { }

    /**
    * @notice This function is triggered when the call data is not empty
    * or when the function that is supposed to receive Ether or data does not exist
    */
    fallback() external payable { }

    /**
    * @notice Get the holders of a domain.
    * @param _domain The domain to retrieve the holder for.
    * @return The address of the holder of the given domain.
    */
    function getDomainHolder(string calldata _domain) external view onlyRegisteredDomain(_domain) returns (address) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();
        return $.domainToHolder[_domain];
    }

    /**
    * @notice Retrieves the fee required to register a domain
    * @return The registration fee for a domain
    */
    function registrationFee() external view returns (uint256) {
        return _getDomainRegistryStorage().registrationFee;
    }

    /// @notice Get the reward amount set for domain holders
    function domainHolderReward() external view returns (uint256) {
        return _getDomainRegistryStorage().domainHolderReward;
    }

    /// @notice Get the total reward amount for a domain
    function getDomainRewardAmount(string memory domainName) external view returns (uint256) {
        return _getDomainRegistryStorage().domainToReward[domainName];
    }

    /// @notice Get the total rewards amount for all domains
    function getTotalDomainRewardAmount() external view returns (uint256) {
        return _getDomainRegistryStorage().totalDomainRewardsAmount;
    }

    /**
    * @notice Registers a new top-level domain
    * @dev Emits a `DomainRegistered` event upon success
    * @param _domain The domain name to register
    */
    function registerDomain(string calldata _domain) payable external availableDomain(_domain) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        if (msg.value != $.registrationFee) revert IncorrectRegistrationFee($.registrationFee);
        if ($.domainToHolder[_domain] != address(0x0)) revert DomainAlreadyRegistered(_domain);

        $.domainToHolder[_domain] = payable(msg.sender);

        emit DomainRegistered(_domain, msg.sender);

        _applyRewardToParentDomainHolder(_domain);
    }

    /**
    * @notice Changes the registration fee for domain registration
    * @dev Emits a `RegistrationFeeChanged` event upon success
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
    function  changeDomainHolderReward(uint256 _newRewardAmount) external onlyOwner {
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
    function withdrawFees() external onlyOwner {
        uint256 feeAmountToWithdraw = address(this).balance - _getDomainRegistryStorage().totalDomainRewardsAmount;
        bool success = _transferEtherTo(payable(owner()), feeAmountToWithdraw);

        if (!success) revert FailedToWithdrawFees();
    }

    /// @notice Withdraw rewards from a domain
    function withdrawRewardForDomain(string memory _domain) external onlyOwner {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        address payable domainHolder = $.domainToHolder[_domain];
        uint256 rewardBalance = _getDomainRewardBalance(_domain);

        if (rewardBalance == 0) revert NothingToWithdraw();

        bool rewardWithdrawn = _transferEtherTo(domainHolder, rewardBalance);
        if (!rewardWithdrawn) revert WithdrawRewardFailed(_domain);

        _resetRewardForDomain(_domain);

        emit DomainHolderRewardWithdrawn({
            domain: _domain,
            controller: domainHolder,
            rewardValue: $.domainHolderReward
        });
    }

    /// @notice Checks whether a domain is registered
    function isDomainRegistered(string memory _domain) public view returns (bool)
    {
        return _getDomainRegistryStorage().domainToHolder[_domain] != address(0x0);
    }

    /// @notice Apply rewards to the domain holder
    function _applyRewardToParentDomainHolder(string memory _domain) private {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        strings.slice memory domainNameSlice = _domain.toSlice();
        strings.slice memory delimiter = ".".toSlice();

        while (!domainNameSlice.empty()) {
            domainNameSlice = domainNameSlice.find(delimiter).beyond(delimiter);
            string memory parentDomainName = domainNameSlice.toString();

            if (isDomainRegistered(parentDomainName)) {
                _applyRewardForDomain(parentDomainName);

                emit DomainHolderRewarded({
                    domain: parentDomainName,
                    controller: $.domainToHolder[parentDomainName],
                    rewardValue: $.domainHolderReward,
                    rewardBalance: _getDomainRewardBalance(parentDomainName)
                });

                break;
            }
        }
    }

    /// @notice Add rewards to a domain's count
    function _applyRewardForDomain(string memory _domain) private onlyRegisteredDomain(_domain) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        $.domainToReward[_domain] += $.domainHolderReward;
        $.totalDomainRewardsAmount += $.domainHolderReward;
    }

    /// @notice Reset a domain's reward after it has been withdrawn
    function _resetRewardForDomain(string memory _domain) private onlyRegisteredDomain(_domain) {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        $.totalDomainRewardsAmount -= $.domainToReward[_domain];
        $.domainToReward[_domain] = 0;
    }

    /// @notice Get a domain's reward
    function _getDomainRewardBalance(string memory _domain)
    private
    view
    onlyRegisteredDomain(_domain)
    returns (uint256) {
        return _getDomainRegistryStorage().domainToReward[_domain];
    }

    /// @notice Transfer Ether to a given address
    function _transferEtherTo(address payable _address, uint256 _amount) private returns (bool) {
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
