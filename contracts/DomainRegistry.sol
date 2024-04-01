// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Domain Registry Contract
/// @notice This contract allows users to register and manage top-level domain names
/// @author developed by Ivan Myasoyedov
contract DomainRegistry {
    /// @notice Address of the contract owner
    address public owner;

    /// @notice Fee required to register a domain
    uint256 public registrationFee;

    /// @dev Struct to store information about a domain
    struct Domain {
        string name;
        address controller;
        uint256 registeredAt;
    }

    /// @dev Array of all domains registered in the contract
    Domain[] public domains;

    /// @dev Mapping from domain name to controller address
    mapping(string => address) public domainToController;

    /// @dev Mapping from controller address to their domains
    mapping(address => Domain[]) public controllerToDomains;

    /// @notice Emitted when a new domain is registered
    event DomainRegistered(
        string domain,
        address indexed controller,
        uint256 timestamp
    );

    /// @dev Ensures that only the owner can call the function
    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function");
        _;
    }

    /// @notice Creates a new DomainRegistry contract
    /// @param _registrationFee The fee required to register a new domain
    constructor(uint256 _registrationFee) {
        owner = msg.sender;
        registrationFee = _registrationFee;
    }

    /// @notice Retrieves the domains controlled by a specific address
    /// @param _controllerAddress The address of the controller to query domains for
    /// @return An array of `Domain` structs controlled by `_controllerAddress`
    function getControllerDomains(address _controllerAddress) public view returns (Domain[] memory) {
        return controllerToDomains[_controllerAddress];
    }

    /// @notice Registers a new top-level domain
    /// @param _domain The domain name to register
    /// @dev Emits a `DomainRegistered` event upon success
    /// @dev The sent value must match the registration fee
    /// @dev The domain must not already be registered
    function registerDomain(string calldata _domain) external payable {
        require(msg.value == registrationFee, "Please submit the correct registration fee");
        require(domainToController[_domain] == address(0), "Domain is already registered");

        domains.push(Domain({
            name: _domain,
            controller: msg.sender,
            registeredAt: block.timestamp
        }));
        domainToController[_domain] = msg.sender;
        controllerToDomains[msg.sender].push(domains[domains.length - 1]);

        emit DomainRegistered(_domain, msg.sender, block.timestamp);
    }

    /// @notice Changes the registration fee
    /// @dev Can only be called by the contract owner
    /// @param _newFee The new fee for registering a domain
    function changeRegistrationFee(uint256 _newFee) external onlyOwner {
        registrationFee = _newFee;
    }

    /// @notice Withdraws the collected registration fees to the owner's address
    /// @dev Can only be called by the contract owner
    function withdrawFees() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
