const { ethers, upgrades } = require("hardhat");

async function deploy() {
    const decimals = 6;
    const registrationFeeInUSDT = ethers.parseUnits("300", decimals); // 300 USDT
    const parentDomainHolderRewardAmount = ethers.parseUnits("30", decimals); // 30 USDT

    const DomainRegistryV2 = await ethers.getContractFactory("DomainRegistryV2");
    const [owner,] = await ethers.getSigners();

    console.log("Deploy contract with address: ", owner.address)

    const usdtTokenAddress = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0";
    const v3AggregatorContractAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

    const domainRegistry = await upgrades.deployProxy(
        DomainRegistryV2, [
            owner.address, registrationFeeInUSDT, parentDomainHolderRewardAmount,
            usdtTokenAddress, v3AggregatorContractAddress,
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
