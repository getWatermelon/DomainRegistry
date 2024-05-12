const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { deployMockUSDTToken } = require("../scripts/mocks/deployMockUSDTToken");
const { deployMockV3Aggregator } = require("../scripts/mocks/deployMockV3Aggregator");

describe("DomainRegistryV2", function () {
    const decimals = 18;
    const registrationFeeInUSDT = ethers.parseUnits("300", decimals); // 300 USDT
    const parentDomainHolderRewardAmount = ethers.parseUnits("30", decimals); // 30 USDT

    let owner, addr1, addr2;
    let domainRegistry
    let domainRegistryAddress;
    let registrationFeeInWei, parentDomainHolderRewardAmountInWei;
    let MockUSDTToken, MockV3Aggregator;

    beforeEach(async function () {
        const DomainRegistry = await ethers.getContractFactory("DomainRegistryV2");
        [owner, addr1, addr2] = await ethers.getSigners();

        MockUSDTToken = await deployMockUSDTToken();
        MockV3Aggregator = await deployMockV3Aggregator();
        const mockUSDTTokenContractAddress = await MockUSDTToken.getAddress();
        const mockV3AggregatorContractAddress = await MockV3Aggregator.getAddress();

        domainRegistry = await upgrades.deployProxy(
            DomainRegistry, [
                owner.address, registrationFeeInUSDT, parentDomainHolderRewardAmount,
                mockUSDTTokenContractAddress, mockV3AggregatorContractAddress,
            ],
            {initializer: "reinitialize"}
        );

        domainRegistryAddress = await domainRegistry.getAddress();

        registrationFeeInWei = await domainRegistry.registrationFeeInETH();
        parentDomainHolderRewardAmountInWei = await domainRegistry.domainHolderRewardInETH();
    });

    describe("Deployment", function () {
        it("Should set the right owner and registration fee and domain holder reward", async function () {
            expect(await domainRegistry.owner()).to.equal(owner.address);
            expect(await domainRegistry.registrationFeeInUSDT()).to.equal(registrationFeeInUSDT);
            expect(await domainRegistry.domainHolderRewardInUSDT()).to.equal(parentDomainHolderRewardAmount);
        });
    });

    describe("isDomainRegistered", function () {
        it("Should check if domain is registered", async function () {
            const domainName = "com";

            await domainRegistry.connect(addr1).registerDomainWithETH(domainName, { value: registrationFeeInWei });

            expect(await domainRegistry.isDomainRegistered("com")).to.equal(true);
            expect(await domainRegistry.isDomainRegistered("ua")).to.equal(false);
        });
    });

    describe("registrationFeeInUSDT", function () {
        it("should show correct fee number in USDT", async function () {
            const registrationFeeInUSDT = await domainRegistry.registrationFeeInUSDT();
            expect(registrationFeeInUSDT).to.equal(registrationFeeInUSDT)
        });
    });

    describe("registrationFeeInETH", function () {
        it("should show correct fee number in ETH", async function () {
            const registrationFeeInETH = await domainRegistry.registrationFeeInETH();
            expect(registrationFeeInETH).to.equal(registrationFeeInWei)
        });
    });

    describe("registerDomainWithUSDT", function () {
        it("Should register a domain with USDT payment", async function () {
            const domainName = "com";
            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))

            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT(domainName);

            const domainHolderAddress = await domainRegistry.getDomainHolder(domainName);
            expect(domainHolderAddress).to.be.equal(addr1.address);
        });

        it("Should fail if user have not enough USDT", async function () {
            const domainName = "com";

            await MockUSDTToken.connect(addr2).approve(domainRegistryAddress, registrationFeeInUSDT);
            await expect(domainRegistry.connect(addr2).registerDomainWithUSDT(domainName))
                .to.be.revertedWithCustomError(domainRegistry, "NotEnoughUSDT")
                .withArgs(registrationFeeInUSDT);
        });

    });

    describe("registerDomainWithETH", function () {
        it("Should register a domain with ETH", async function () {
            const domainName = "com";
            await domainRegistry.connect(addr1).registerDomainWithETH(domainName, { value: registrationFeeInWei });
            const domainHolderAddress = await domainRegistry.getDomainHolder(domainName);

            expect(domainHolderAddress).to.be.equal(addr1.address);
        });

        it("Should take right fee amount", async function () {
            const domainName = "com";

            const initialAccountBalance = await ethers.provider.getBalance(addr1.address)

            const transaction = await domainRegistry.connect(addr1).registerDomainWithETH(domainName, { value: registrationFeeInWei });
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice

            const accountBalanceAfterRegister = await ethers.provider.getBalance(addr1.address)

            expect(initialAccountBalance).to.be.equal(accountBalanceAfterRegister + registrationFeeInWei + gasUsed);
        });

        it("Should can register multiple domains", async function () {
            const firstDomainName = "com";
            const secondDomainName = "org.com";

            await domainRegistry.connect(addr1).registerDomainWithETH(firstDomainName, { value: registrationFeeInWei });
            await domainRegistry.connect(addr1).registerDomainWithETH(secondDomainName, { value: registrationFeeInWei });

            const firstDomainNameHolderAddress = await domainRegistry.getDomainHolder(firstDomainName);
            const secondDomainNameHolderAddress = await domainRegistry.getDomainHolder(secondDomainName);

            expect(firstDomainNameHolderAddress).to.be.equal(addr1.address);
            expect(secondDomainNameHolderAddress).to.be.equal(addr1.address);

        });

        it("Should fail for incorrect fee", async function () {
            const domain = "com";

            const incorrectFee = registrationFeeInUSDT - 1n;

            await expect(domainRegistry.connect(addr1).registerDomainWithETH(domain, { value: incorrectFee }))
                .to.be.revertedWithCustomError(domainRegistry, "IncorrectRegistrationFee")
                .withArgs(registrationFeeInWei);
        });

        it("Should not allow register a domain that is already registered", async function () {
            const domainName = "com";

            await domainRegistry.connect(addr1).registerDomainWithETH(domainName, { value: registrationFeeInWei });

            await expect(domainRegistry.connect(addr2).registerDomainWithETH(domainName, { value: registrationFeeInWei }))
                .to.be.revertedWithCustomError(domainRegistry, "DomainAlreadyRegistered")
                .withArgs(domainName);
        });

        it("Should set a right reward to domain owner", async function () {
            await domainRegistry.connect(owner).registerDomainWithETH("com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr1).registerDomainWithETH("org.com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr1).registerDomainWithETH("ua.com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr2).registerDomainWithETH("dev.org.com", { value: registrationFeeInWei });

            expect(await domainRegistry.connect(owner).getAddressRewardAmountInETH(owner)).to.be.equal(
                parentDomainHolderRewardAmountInWei * BigInt(2)
            );
            expect(await domainRegistry.connect(addr1).getAddressRewardAmountInETH(addr1)).to.be.equal(
                parentDomainHolderRewardAmountInWei * BigInt(1)
            );
        });
    });

    describe("withdrawDomainHolderRewardInUSDT", function () {
        it("Should withdraw correct amount of USDT to parent domain holder", async function () {
            await MockUSDTToken.transfer(owner, ethers.parseUnits("1000", decimals))
            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))
            await MockUSDTToken.transfer(addr2, ethers.parseUnits("1000", decimals))

            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("ua");
            await MockUSDTToken.connect(addr2).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr2).registerDomainWithUSDT("com.ua");

            const totalRegistrationFee = 2n * registrationFeeInUSDT

            const domainRegistryUSDTTokenBalance = await MockUSDTToken.balanceOf(domainRegistryAddress);
            expect(domainRegistryUSDTTokenBalance).to.be.equal(totalRegistrationFee);


            const withdrawTransaction = await domainRegistry.connect(addr1).withdrawDomainHolderRewardInUSDT();

            const domainHolderAddress = await domainRegistry.getDomainHolder("ua");
            expect(domainHolderAddress).to.be.equal(addr1.address);

            await expect(withdrawTransaction).to.changeTokenBalance(
                MockUSDTToken,
                addr1.address,
                parentDomainHolderRewardAmount,
            );
        });

        it("Should fail if nothing to withdraw", async function () {
            await expect(domainRegistry.connect(addr2).withdrawDomainHolderRewardInUSDT())
                .to.be.revertedWithCustomError(domainRegistry, "NothingToWithdraw");
        });
    });

    describe("withdrawDomainHolderRewardInETH", function () {
        it("Should withdraw correct amount of ether to parent domain holder", async function () {
            await domainRegistry.connect(addr1).registerDomainWithETH("com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr2).registerDomainWithETH("org.com", { value: registrationFeeInWei });

            expect(await domainRegistry.connect(addr1).getAddressRewardAmountInETH(addr1)).to.be.equal(
                parentDomainHolderRewardAmountInWei
            );

            const initialAddr1AccountBalance = await ethers.provider.getBalance(addr1);

            const transaction = await domainRegistry.connect(addr1).withdrawDomainHolderRewardInETH();
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice


            const addr1AccountBalanceAfterRewardWithdraw = await ethers.provider.getBalance(addr1)

            expect(addr1AccountBalanceAfterRewardWithdraw).to.be.equal(
                initialAddr1AccountBalance + parentDomainHolderRewardAmountInWei - gasUsed
            );
            expect(await domainRegistry.connect(addr1).getAddressRewardAmountInETH(addr1)).to.be.equal(0);
        });

        it("Should fail if nothing to withdraw", async function () {
            await domainRegistry.connect(addr1).registerDomainWithETH("com", { value: registrationFeeInWei });

            await expect(domainRegistry.connect(addr2).withdrawDomainHolderRewardInETH())
                .to.be.revertedWithCustomError(domainRegistry, "NothingToWithdraw");
        });
    });

    describe("withdrawFeesInUSDT", function () {
        it("Should allow the owner to withdraw USDT fees", async function () {
            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))

            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("ua");


            const withdrawTransaction = await domainRegistry.connect(owner).withdrawFeesInUSDT();

            await expect(withdrawTransaction).to.changeTokenBalance(
                MockUSDTToken,
                owner.address,
                registrationFeeInUSDT,
            );
        });

        it("Should withdraw correct fees according to domain holder Rewards", async function () {
            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))
            await MockUSDTToken.transfer(addr2, ethers.parseUnits("1000", decimals))

            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("com");
            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("org.com");
            await MockUSDTToken.connect(addr2).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr2).registerDomainWithUSDT("ua.org.com");

            const totalRegistrationFee = registrationFeeInUSDT * BigInt(3);
            const totaldomainHolderRewards = parentDomainHolderRewardAmount * BigInt(2);


            const withdrawTransaction = await domainRegistry.connect(owner).withdrawFeesInUSDT();

            await expect(withdrawTransaction).to.changeTokenBalance(
                MockUSDTToken,
                owner.address,
                totalRegistrationFee - totaldomainHolderRewards,
            );
        });

        it("Should fail if not called by the owner", async function () {
            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))

            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("ua");

            await expect(domainRegistry.connect(addr1).withdrawFeesInUSDT())
                .to.be.revertedWithCustomError(domainRegistry, "OwnableUnauthorizedAccount");
        });
    });

    describe("withdrawFeesInETH", function () {
        it("Should allow the owner to withdraw fees", async function () {
            await domainRegistry.connect(addr1).registerDomainWithETH("com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr1).registerDomainWithETH("org", { value: registrationFeeInWei });
            await domainRegistry.connect(addr2).registerDomainWithETH("ua", { value: registrationFeeInWei });
            const totalRegistrationFee = registrationFeeInWei * BigInt(3);

            const initialOwnerAccountBalance = await ethers.provider.getBalance(owner.address);

            const transaction = await domainRegistry.connect(owner).withdrawFeesInETH();
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice;

            const ownerAccountBalanceAfterWithdraw = await ethers.provider.getBalance(owner.address)

            expect(ownerAccountBalanceAfterWithdraw).to.be.equal(
                initialOwnerAccountBalance + totalRegistrationFee - gasUsed
            );
        });

        it("Should withdraw correct fees according to domain holder Rewards", async function () {
            await domainRegistry.connect(addr1).registerDomainWithETH("com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr1).registerDomainWithETH("org.com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr2).registerDomainWithETH("ua.org.com", { value: registrationFeeInWei });
            const totalRegistrationFee = registrationFeeInWei * BigInt(3);
            const totaldomainHolderRewards = parentDomainHolderRewardAmountInWei * BigInt(2);

            const initialOwnerAccountBalance = await ethers.provider.getBalance(owner);

            const transaction = await domainRegistry.connect(owner).withdrawFeesInETH();
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice;

            const ownerAccountBalanceAfterWithdraw = await ethers.provider.getBalance(owner)

            expect(ownerAccountBalanceAfterWithdraw).to.be.equal(
                initialOwnerAccountBalance + totalRegistrationFee - totaldomainHolderRewards - gasUsed
            );
        });

        it("Should fail if not called by the owner", async function () {
            await domainRegistry.connect(addr1).registerDomainWithETH("com", { value: registrationFeeInWei });

            await expect(domainRegistry.connect(addr1).withdrawFeesInETH())
                .to.be.revertedWithCustomError(domainRegistry, "OwnableUnauthorizedAccount");
        });
    });

    describe("getAddressRewardAmountInUSDT", function () {
        it("Should return right total parent domain reward amount in Wei", async function () {
            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))
            await MockUSDTToken.transfer(addr2, ethers.parseUnits("1000", decimals))

            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("com");
            await MockUSDTToken.connect(addr2).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr2).registerDomainWithUSDT("org.com");
            await MockUSDTToken.connect(addr2).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr2).registerDomainWithUSDT("ua.com");
            const totalDomainHolderRewardAmount = parentDomainHolderRewardAmount * BigInt(2);

            expect(await domainRegistry.getAddressRewardAmountInUSDT(addr1)).to.equal(totalDomainHolderRewardAmount);
        });
    });

    describe("getAddressRewardAmountInETH", function () {
        it("Should return right total parent domain reward amount in USDT", async function () {
            await domainRegistry.connect(addr1).registerDomainWithETH("com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr2).registerDomainWithETH("org.com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr2).registerDomainWithETH("ua.com", { value: registrationFeeInWei });
            const totalDomainHolderRewardAmount = parentDomainHolderRewardAmountInWei * BigInt(2);

            expect(await domainRegistry.getAddressRewardAmountInETH(addr1)).to.equal(totalDomainHolderRewardAmount);
        });
    });

    describe("changeRegistrationFee", function () {
        it("Should change the registration fee by the owner", async function () {
            const newRegistrationFee = ethers.parseUnits("301", decimals)

            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            expect(await domainRegistry.registrationFeeInUSDT()).to.equal(newRegistrationFee);
        });

        it("Should fail if not called by the owner", async function () {
            const newRegistrationFee = ethers.parseUnits("301", decimals)

            await expect(domainRegistry.connect(addr1).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "OwnableUnauthorizedAccount");
        });

        it("Should fail if fee is less then 0", async function () {
            const newRegistrationFee = ethers.parseUnits("0", decimals)

            await expect(domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "RegistrationFeeMustBeGreaterThanZero");
        });

        it("Should fail if fee is equal to current", async function () {
            const newRegistrationFee = ethers.parseUnits("300", decimals)

            await expect(domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "NewRegistrationFeeMustDifferFromCurrent");
        });
    });

    describe("changeDomainHolderReward", function () {
        it("Should change the parent domain reward by the owner", async function () {
            const newDomainHolderReward = ethers.parseUnits("31", decimals)

            await domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward);

            expect(await domainRegistry.domainHolderRewardInUSDT()).to.equal(newDomainHolderReward);
        });

        it("Should fail if not called by the owner", async function () {
            const newDomainHolderReward = ethers.parseUnits("31", decimals)

            await expect(domainRegistry.connect(addr1).changeDomainHolderReward(newDomainHolderReward))
                .to.be.revertedWithCustomError(domainRegistry, "OwnableUnauthorizedAccount");
        });

        it("Should fail if fee is less then 0", async function () {
            const newDomainHolderReward = ethers.parseUnits("0", decimals)

            await expect(domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward))
                .to.be.revertedWithCustomError(domainRegistry, "DomainHolderRewardMustBeGreaterThanZero");
        });

        it("Should fail if fee is equal to current", async function () {
            const newDomainHolderReward = ethers.parseUnits("30", decimals)

            await expect(domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward))
                .to.be.revertedWithCustomError(domainRegistry, "NewDomainHolderRewardMustDifferFromCurrent");
        });
    });

    describe("Metrics", function () {
        function sortDomainsByRegistrationDate(events) {
            return events.sort((a, b) => a.args.registeredAt - b.args.registeredAt);
        }

        async function getControllerRegisteredDomains(controllerAddress) {
            const filter = domainRegistry.filters.DomainRegistered(null, controllerAddress)

            let events = await domainRegistry.queryFilter(filter);
            events = sortDomainsByRegistrationDate(events);

            return events;
        }

        async function logEvents(events) {
            return await Promise.all(events.map(async (event) => {
                const block = await ethers.provider.getBlock(event.blockNumber);
                console.log("block.timestamp: ", block.timestamp);
                console.log("event.args: ", event.args);
            }));
        }

        it("DomainRegistered", async function () {
            await domainRegistry.connect(owner).registerDomainWithETH("com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr1).registerDomainWithETH("org.com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr1).registerDomainWithETH("ua.org.com", { value: registrationFeeInWei });


            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))
            await MockUSDTToken.transfer(addr2, ethers.parseUnits("1000", decimals))

            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("edu");
            await MockUSDTToken.connect(addr2).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr2).registerDomainWithUSDT("edu.net");
            await MockUSDTToken.connect(addr2).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr2).registerDomainWithUSDT("gov");

            const numberOfDomainsRegistered = 6;

            console.log("Number of registered domains:");

            const filter = domainRegistry.filters.DomainRegistered()
            let events = await domainRegistry.queryFilter(filter);

            console.log(events.length)
            expect(events.length).to.equal(numberOfDomainsRegistered);

            console.log("All registered domains filter by date:");

            events = sortDomainsByRegistrationDate(events)
            await logEvents(events);

            console.log("Registered domain by a concrete controllers filter by date: ");

            const controllers = [owner, addr1, addr2];

            controllers.map(async controller => {
                const events = await getControllerRegisteredDomains(controller.address);
                console.log("Controller address: ", controller.address);
                await logEvents(events);
            });

        });

        it("DomainHolderRewarded and DomainHolderRewardWithdrawn", async function () {
            await domainRegistry.connect(owner).registerDomainWithETH("com", { value: registrationFeeInWei });

            await MockUSDTToken.transfer(addr1, ethers.parseUnits("1000", decimals))
            await MockUSDTToken.connect(addr1).approve(domainRegistryAddress, registrationFeeInUSDT);
            await domainRegistry.connect(addr1).registerDomainWithUSDT("org.com");

            await domainRegistry.connect(addr2).registerDomainWithETH("ua.org.com", { value: registrationFeeInWei });
            await domainRegistry.connect(addr2).registerDomainWithETH("dev.org.com", { value: registrationFeeInWei });

            await domainRegistry.connect(owner).withdrawDomainHolderRewardInUSDT();
            await domainRegistry.connect(addr1).withdrawDomainHolderRewardInETH();

            let filter = domainRegistry.filters.DomainHolderRewarded();

            let events = await domainRegistry.queryFilter(filter);

            console.log("All domain holder reward events:");
            await logEvents(events);

            filter = domainRegistry.filters.DomainHolderRewardWithdrawn();

            events = await domainRegistry.queryFilter(filter);

            console.log("All domain holder reward withdraw events:");
            await logEvents(events);
        });

        it("RegistrationFeeChanged", async function () {
            let newRegistrationFee = ethers.parseUnits("301", decimals);
            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            newRegistrationFee = ethers.parseUnits("302", decimals);
            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            const filter = domainRegistry.filters.RegistrationFeeChanged();

            let events = await domainRegistry.queryFilter(filter);

            console.log("All changed fee events:");
            await logEvents(events);
        });

        it("DomainHolderRewardChanged", async function () {
            let newDomainHolderReward = ethers.parseUnits("31", decimals);
            await domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward);

            newDomainHolderReward = ethers.parseUnits("32", decimals);
            await domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward);

            const filter = domainRegistry.filters.DomainHolderRewardChanged();

            let events = await domainRegistry.queryFilter(filter);

            console.log("All changed domain holder reward events:");
            await logEvents(events);
        });

    });
});
