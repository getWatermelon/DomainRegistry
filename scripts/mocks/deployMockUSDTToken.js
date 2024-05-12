const { ethers, upgrades } = require("hardhat");

const deployMockUSDTToken = async function() {
    const mockUSDTTokenFactory = await ethers.getContractFactory("MockUSDCToken")
    const MockUSDTToken = await mockUSDTTokenFactory.deploy();

    const mockUSDTTokenAddress = await MockUSDTToken.getAddress();

    console.log("MockUSDTToken contract deployed with address: ", mockUSDTTokenAddress)
    return MockUSDTToken;
}

module.exports.deployMockUSDTToken = deployMockUSDTToken;
