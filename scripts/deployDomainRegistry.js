const hre = require("hardhat");

const PWEI_DECIMAL_PLACES = 15;

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const deployerAddress = await deployer.getAddress()
    console.log("Deploying contracts with the account:", deployerAddress);

    const registrationFeeAmount = hre.ethers.parseUnits('15', PWEI_DECIMAL_PLACES)
    const DomainRegistry = await hre.ethers.getContractFactory("DomainRegistry");

    const contract = await DomainRegistry.deploy(registrationFeeAmount);
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    console.log("Contract address:", contractAddress);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
