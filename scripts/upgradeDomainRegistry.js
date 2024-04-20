const { ethers, upgrades } = require("hardhat");
const assert = require("assert");

const PWEI_DECIMAL_PLACES = 15;

async function upgrade() {
    const registrationFeeAmount = ethers.parseUnits('15', PWEI_DECIMAL_PLACES)
    const [deployer] = await ethers.getSigners();

    const domainRegistryV1ContractAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    const DomainRegistryV2 = await ethers.getContractFactory("DomainRegistryV2");

    const parentDomainHolderRewardAmount = ethers.parseUnits('1', PWEI_DECIMAL_PLACES)

    const upgradedDomainRegistry = await upgrades.upgradeProxy(domainRegistryV1ContractAddress, DomainRegistryV2, {call: {
            fn: "reinitialize",
            args: [deployer.address, registrationFeeAmount, parentDomainHolderRewardAmount],
        }});

    await upgradedDomainRegistry.waitForDeployment();

    const domainRegistryV2ContractAddress = await upgradedDomainRegistry.getAddress();

    console.log("Contract address before upgrade: ", domainRegistryV1ContractAddress)
    console.log("Upgraded contract address: ", domainRegistryV2ContractAddress);

    assert(domainRegistryV1ContractAddress == domainRegistryV2ContractAddress);
}

upgrade()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
