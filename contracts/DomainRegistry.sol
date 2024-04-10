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

/// @dev Error thrown when the domain length exceeds the maximum allowed length
error ExceededDomainMaxLength(uint8 maxLength);

/// @dev Error thrown when the limit for searching controller domains exceeds the maximum allowed limit
error ExceededControllerDomainsSearchLimit(uint8 maxLimit);

/**
* @title Domain Registry Contract
* @notice This contract allows users to register and manage top-level domain names
* @author Developed by Ivan Myasoyedov
*/
contract DomainRegistry {
    uint8 public constant MAX_DOMAIN_LENGTH = 32;
    uint8 public constant MAX_CONTROLLER_DOMAINS_SEARCH_LIMIT = 100;

    /// @notice Address of the contract owner
    address public owner;

    /// @notice Fee required to register a domain
    uint256 public registrationFee;

    /// @dev Stores whether a domain is registered
    mapping(string => bool) public registeredDomains;

    /// @dev Mapping from controller address to their registered domains
    mapping(address => string[]) public controllerToDomains;

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
    * @notice Retrieves a subset of domains controlled by a specific address
    * @param _controllerAddress The address of the controller to query domains for
    * @param _offset The starting index for domain retrieval
    * @param _limit The maximum number of domains to retrieve
    * @return domains A subset of domain names controlled by `_controllerAddress`
    */
    function getControllerDomains(
        address _controllerAddress,
        uint256 _offset,
        uint256 _limit
    ) external view returns (string[] memory domains) {
        if (_limit > MAX_CONTROLLER_DOMAINS_SEARCH_LIMIT) {
            revert ExceededControllerDomainsSearchLimit(MAX_CONTROLLER_DOMAINS_SEARCH_LIMIT);
        }

        string[] memory registeredDomains = controllerToDomains[_controllerAddress];
        uint256 registeredCount = registeredDomains.length;

        if (_offset >= registeredCount) {
            return new string[](0);
        }

        uint256 resultSize = (registeredCount - _offset > _limit) ? _limit : registeredCount - _offset;
        string[] memory resultDomains = new string[](resultSize);

        for (uint256 i = 0; i < resultSize; ++i) {
            resultDomains[i] = registeredDomains[_offset + i];
        }

        return resultDomains;
    }

    /**
    * @notice Registers a new top-level domain
    * @dev Emits a `DomainRegistered` event upon success
    * @param _domain The domain name to register
    */
    function registerDomain(string calldata _domain) external payable {
        if (msg.value != registrationFee) revert IncorrectRegistrationFee(registrationFee);
        if (registeredDomains[_domain]) revert DomainAlreadyRegistered(_domain);
        if (bytes(_domain).length > MAX_DOMAIN_LENGTH) revert ExceededDomainMaxLength(MAX_DOMAIN_LENGTH);

        registeredDomains[_domain] = true;
        controllerToDomains[msg.sender].push(_domain);

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
