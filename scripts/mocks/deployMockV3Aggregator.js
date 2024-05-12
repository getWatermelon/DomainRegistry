const { ethers, upgrades } = require("hardhat");

const deployMockV3Aggregator = async function() {
    const decimals = "18"
    const price = ethers.parseUnits("3000", 18)
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator")

    const MockV3Aggregator = await mockV3AggregatorFactory.deploy(decimals, price);

    const mockV3AggregatorAddress = await MockV3Aggregator.getAddress();
    console.log("MockV3Aggregator contract deployed with address: ", mockV3AggregatorAddress)

    return MockV3Aggregator;
}

module.exports.deployMockV3Aggregator = deployMockV3Aggregator
