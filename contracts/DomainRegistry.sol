// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
* @title Domain Registry Contract
* @notice This contract allows users to register and manage top-level domain names
* @author Developed by Ivan Myasoyedov
*/
contract DomainRegistry is OwnableUpgradeable {
    /// @custom:storage-location erc7201:main.DomainRegistry.storage
    struct DomainRegistryStorage {
        /// @notice Fee required to register a domain
        uint256 registrationFee;

        /// @dev Mapping from domain name to its holder address
        mapping(string => address payable) domainToHolder;
    }

    // keccak256(abi.encode(uint256(keccak256("main.DomainRegistry.storage")) - 1)) & ~bytes32(uint256(0xff));
    bytes32 private constant DomainRegistryStorageLocation =
    0xb611e20da8e0f23a29d564e0e10e4725f38cca3e24b5e476e1c2af79291d8a00;

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

    /// @notice Emitted when a new domain is registered
    event DomainRegistered(string domain, address indexed controller);

    /// @notice Emitted when the registration fee is changed
    event RegistrationFeeChanged(uint256 newRegistrationFee);

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

    function initialize(address _owner, uint _registrationFee) public initializer {
        if (_registrationFee <= 0) revert RegistrationFeeMustBeGreaterThanZero();
        __Ownable_init(_owner);
        _getDomainRegistryStorage().registrationFee = _registrationFee;
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
    function getDomainHolder(string calldata _domain) external view returns (address) {
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

    /**
    * @notice Registers a new top-level domain
    * @dev Emits a `DomainRegistered` event upon success
    * @param _domain The domain name to register
    */
    function registerDomain(string calldata _domain) external payable {
        DomainRegistryStorage storage $ = _getDomainRegistryStorage();

        if (msg.value != $.registrationFee) revert IncorrectRegistrationFee($.registrationFee);
        if ($.domainToHolder[_domain] != address(0x0)) revert DomainAlreadyRegistered(_domain);

        $.domainToHolder[_domain] = payable(msg.sender);

        emit DomainRegistered(_domain, msg.sender);
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

    /**
    * @notice Withdraws the collected registration fees to the owner's address
    * @dev Can only be called by the contract owner
    */
    function withdrawFees() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        if (!success) revert FailedToWithdrawFees();
    }
}
