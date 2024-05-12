const { ethers, upgrades } = require("hardhat");
const { deployMockUSDTToken } = require("../scripts/mocks/deployMockUSDTToken");
const { deployMockV3Aggregator } = require("../scripts/mocks/deployMockV3Aggregator");

async function deploy() {
    const decimals = 18;
    const registrationFeeInUSDT = ethers.parseUnits("300", decimals); // 300 USDT
    const parentDomainHolderRewardAmount = ethers.parseUnits("30", decimals); // 30 USDT

    const DomainRegistry = await ethers.getContractFactory("DomainRegistryV2");
    const [owner,] = await ethers.getSigners();

    console.log("Deploy contract with address: ", owner.address)

    const MockUSDTToken = await deployMockUSDTToken();
    const MockV3Aggregator = await deployMockV3Aggregator();
    const mockUSDTTokenContractAddress = await MockUSDTToken.getAddress();
    const mockV3AggregatorContractAddress = await MockV3Aggregator.getAddress();

    const domainRegistry = await upgrades.deployProxy(
        DomainRegistry, [
            owner.address, registrationFeeInUSDT, parentDomainHolderRewardAmount,
            mockUSDTTokenContractAddress, mockV3AggregatorContractAddress,
        ],
        {initializer: "reinitialize"}
    );

    await domainRegistry.waitForDeployment();

    const domainRegistryAddress = await domainRegistry.getAddress();
    console.log("DomainRegistryV2 deployed with address: ", domainRegistryAddress);
}

deploy()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
