// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Error thrown when a function caller is not the owner
error OnlyOwnerCanCall();

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

/**
* @title Domain Registry Contract
* @notice This contract allows users to register and manage top-level domain names
* @author Developed by Ivan Myasoyedov
*/
contract DomainRegistry {
    /// @notice Address of the contract owner
    address public owner;

    /// @notice Fee required to register a domain
    uint256 public registrationFee;

    /// @dev Mapping from domain name to its holder address
    mapping(string => address payable) public domainToHolder;

    /// @notice Emitted when a new domain is registered
    event DomainRegistered(string domain, address indexed controller);

    /// @notice Emitted when the registration fee is changed
    event RegistrationFeeChanged(uint256 newRegistrationFee);

    /// @dev Modifier to restrict function access to contract owner
    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwnerCanCall();
        _;
    }

    /**
    * @notice Contract constructor that sets the initial registration fee
    * @param _registrationFee The fee required to register a new domain
    */
    constructor(uint256 _registrationFee) {
        if (_registrationFee <= 0) revert RegistrationFeeMustBeGreaterThanZero();
        owner = msg.sender;
        registrationFee = _registrationFee;
    }

    /**
    * @notice Get the holders of a domain.
    * @param _domain The domain to retrieve the holder for.
    * @return The address of the holder of the given domain.
    */
    function getDomainHolder(string calldata _domain) external view returns (address) {
        return domainToHolder[_domain];
    }

    /**
    * @notice Registers a new top-level domain
    * @dev Emits a `DomainRegistered` event upon success
    * @param _domain The domain name to register
    */
    function registerDomain(string calldata _domain) external payable {
        if (msg.value != registrationFee) revert IncorrectRegistrationFee(registrationFee);
        if (domainToHolder[_domain] != address(0x0)) revert DomainAlreadyRegistered(_domain);

        domainToHolder[_domain] = payable(msg.sender);

        emit DomainRegistered(_domain, msg.sender);
    }

    /**
    * @notice Changes the registration fee for domain registration
    * @dev Emits a `RegistrationFeeChanged` event upon success
    * @param _newFee The new fee for registering a domain
    */
    function changeRegistrationFee(uint256 _newFee) external onlyOwner {
        if (_newFee <= 0) revert RegistrationFeeMustBeGreaterThanZero();
        if (_newFee == registrationFee) revert NewRegistrationFeeMustDifferFromCurrent();
        registrationFee = _newFee;
        emit RegistrationFeeChanged(_newFee);
    }

    /**
    * @notice Withdraws the collected registration fees to the owner's address
    * @dev Can only be called by the contract owner
    */
    function withdrawFees() external onlyOwner {
        (bool success, ) = payable(owner).call{value: address(this).balance}("");
        if (!success) revert FailedToWithdrawFees();
    }
}
