const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { deployMockUSDTToken } = require("../scripts/mocks/deployMockUSDTToken");
const { deployMockV3Aggregator } = require("../scripts/mocks/deployMockV3Aggregator");

describe("DomainRegistry upgrade", function () {
    const PWEI_DECIMAL_PLACES_NUMBER = 15;

    it("Should preserve all data from V1 version", async function() {
        const [owner, addr1, addr2] = await ethers.getSigners();
        const registrationFee = ethers.parseUnits("15", PWEI_DECIMAL_PLACES_NUMBER);
        const onwerDomains = ["com"];
        const addr1Domains = ["ua", "org", "edu"];
        const addr2Domains = ["net", "gov"];

        const DomainRegistryProxyV1 = await ethers.getContractFactory("DomainRegistry");
        let domainRegistry = await upgrades.deployProxy(
            DomainRegistryProxyV1, [owner.address, registrationFee], {initializer: 'initialize'}
        );

        for (let domain of onwerDomains) {
            await domainRegistry.connect(owner).registerDomain(domain, { value: registrationFee });
        }
        for (let domain of addr1Domains) {
            await domainRegistry.connect(addr1).registerDomain(domain, { value: registrationFee });
        }
        for (let domain of addr2Domains) {
            await domainRegistry.connect(addr2).registerDomain(domain, { value: registrationFee });
        }

        const domainRegistryV1balance = await ethers.provider.getBalance(domainRegistry);
        const domainRegistryV1address = await domainRegistry.getAddress();

        const newRegistrationFee = ethers.parseUnits("300", 18);
        const parentDomainHolderRewardAmount = ethers.parseUnits("30", 18);

        const DomainRegistryV2 = await ethers.getContractFactory("DomainRegistryV2");
        const MockUSDTToken = await deployMockUSDTToken();
        const MockV3Aggregator = await deployMockV3Aggregator();

        const mockUSDTTokenContractAddress = await MockUSDTToken.getAddress();
        const mockV3AggregatorContractAddress = await MockV3Aggregator.getAddress();

        domainRegistry = await upgrades.upgradeProxy(domainRegistryV1address, DomainRegistryV2, {call: {
                fn: "reinitialize",
                args: [
                    owner.address, newRegistrationFee, parentDomainHolderRewardAmount,
                    mockUSDTTokenContractAddress, mockV3AggregatorContractAddress,
                ]
        }});

        expect(await domainRegistry.owner()).to.equal(owner);
        expect(await ethers.provider.getBalance(domainRegistry)).to.equal(domainRegistryV1balance);

        expect(await domainRegistry.getDomainHolder(onwerDomains[0])).to.equal(owner);

        expect(await domainRegistry.getDomainHolder(addr1Domains[0])).to.equal(addr1);
        expect(await domainRegistry.getDomainHolder(addr1Domains[1])).to.equal(addr1);
        expect(await domainRegistry.getDomainHolder(addr1Domains[2])).to.equal(addr1);

        expect(await domainRegistry.getDomainHolder(addr2Domains[0])).to.equal(addr2);
        expect(await domainRegistry.getDomainHolder(addr2Domains[1])).to.equal(addr2);

        const initialOwnerAccountBalance = await ethers.provider.getBalance(owner.address);

        const transaction = await domainRegistry.connect(owner).withdrawFeesInETH();
        const transactionReceipt = await transaction.wait();
        const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice;

        const ownerAccountBalanceAfterWithdraw = await ethers.provider.getBalance(owner.address)

        expect(ownerAccountBalanceAfterWithdraw).to.be.equal(
            initialOwnerAccountBalance + domainRegistryV1balance - gasUsed
        );

        const contractBalanceAfterWithdraw = await ethers.provider.getBalance(domainRegistry)

        expect(contractBalanceAfterWithdraw).to.be.equal(0);
    })
});
