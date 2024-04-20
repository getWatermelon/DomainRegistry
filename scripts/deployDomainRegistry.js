const { ethers, upgrades } = require("hardhat");

const PWEI_DECIMAL_PLACES = 15;

async function deploy() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log("Deploying contracts with the account:", deployerAddress);

    const registrationFeeAmount = ethers.parseUnits('15', PWEI_DECIMAL_PLACES)
    const DomainRegistry = await ethers.getContractFactory("DomainRegistry");

    const contract = await upgrades.deployProxy(DomainRegistry, [deployer.address, registrationFeeAmount], {initializer: 'initialize'});
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    console.log("Contract address:", contractAddress);
}

deploy()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
