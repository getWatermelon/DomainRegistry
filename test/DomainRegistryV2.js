const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");


describe("DomainRegistryV2", function () {
    const PWEI_DECIMAL_PLACES_NUMBER = 15;
    const registrationFee = ethers.parseUnits("15", PWEI_DECIMAL_PLACES_NUMBER);
    const parentDomainHolderRewardAmount = ethers.parseUnits("1", PWEI_DECIMAL_PLACES_NUMBER);

    let domainRegistry
    let owner, addr1, addr2;

    beforeEach(async function () {
        const DomainRegistry = await ethers.getContractFactory("DomainRegistryV2");
        [owner, addr1, addr2] = await ethers.getSigners();

        domainRegistry = await upgrades.deployProxy(
            DomainRegistry, [owner.address, registrationFee, parentDomainHolderRewardAmount],
            {initializer: "reinitialize"}
        );
    });

    describe("Deployment", function () {
        it("Should set the right owner and registration fee and domain holder reward", async function () {
            expect(await domainRegistry.owner()).to.equal(owner.address);
            expect(await domainRegistry.registrationFee()).to.equal(registrationFee);
            expect(await domainRegistry.domainHolderReward()).to.equal(parentDomainHolderRewardAmount);
        });
    });

    describe("registerDomain", function () {
        it("Should register a domain", async function () {
            const domainName = "com";
            await domainRegistry.connect(addr1).registerDomain(domainName, { value: registrationFee });
            const domainHolderAddress = await domainRegistry.getDomainHolder(domainName);

            expect(domainHolderAddress).to.be.equal(addr1.address);
        });

        it("Should take right fee amount", async function () {
            const domainName = "com";

            const initialAccountBalance = await ethers.provider.getBalance(addr1.address)

            const transaction = await domainRegistry.connect(addr1).registerDomain(domainName, { value: registrationFee });
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice

            const accountBalanceAfterRegister = await ethers.provider.getBalance(addr1.address)

            expect(initialAccountBalance).to.be.equal(accountBalanceAfterRegister + registrationFee + gasUsed);
        });

        it("Should can register multiple domains", async function () {
            const firstDomainName = "com";
            const secondDomainName = "org.com";

            await domainRegistry.connect(addr1).registerDomain(firstDomainName, { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain(secondDomainName, { value: registrationFee });

            const firstDomainNameHolderAddress = await domainRegistry.getDomainHolder(firstDomainName);
            const secondDomainNameHolderAddress = await domainRegistry.getDomainHolder(secondDomainName);

            expect(firstDomainNameHolderAddress).to.be.equal(addr1.address);
            expect(secondDomainNameHolderAddress).to.be.equal(addr1.address);

        });

        it("Should fail for incorrect fee", async function () {
            const domain = "com";

            const incorrectFee = registrationFee - 1n;

            await expect(domainRegistry.connect(addr1).registerDomain(domain, { value: incorrectFee }))
                .to.be.revertedWithCustomError(domainRegistry, "IncorrectRegistrationFee")
                .withArgs(registrationFee);
        });

        it("Should not allow register a domain that is already registered", async function () {
            const domainName = "com";

            await domainRegistry.connect(addr1).registerDomain(domainName, { value: registrationFee });

            await expect(domainRegistry.connect(addr2).registerDomain(domainName, { value: registrationFee }))
                .to.be.revertedWithCustomError(domainRegistry, "DomainAlreadyRegistered")
                .withArgs(domainName);
        });

        it("Should set a right reward to domain owner", async function () {
            await domainRegistry.connect(owner).registerDomain("com", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("org.com", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("ua.com", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("dev.org.com", { value: registrationFee });

            expect(await domainRegistry.connect(owner).getAddressRewardAmount(owner)).to.be.equal(
                parentDomainHolderRewardAmount * BigInt(2)
            );
            expect(await domainRegistry.connect(addr1).getAddressRewardAmount(addr1)).to.be.equal(
                parentDomainHolderRewardAmount * BigInt(1)
            );
        });
    });

    describe("withdrawDomainHolderReward", function () {
        it("Should withdraw correct amount of ether to parent domain holder", async function () {
            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("org.com", { value: registrationFee });

            expect(await domainRegistry.connect(addr1).getAddressRewardAmount(addr1)).to.be.equal(
                parentDomainHolderRewardAmount
            );

            const initialAddr1AccountBalance = await ethers.provider.getBalance(addr1);

            const transaction = await domainRegistry.connect(addr1).withdrawDomainHolderReward();
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice


            const addr1AccountBalanceAfterRewardWithdraw = await ethers.provider.getBalance(addr1)

            expect(addr1AccountBalanceAfterRewardWithdraw).to.be.equal(
                initialAddr1AccountBalance + parentDomainHolderRewardAmount - gasUsed
            );
            expect(await domainRegistry.connect(addr1).getAddressRewardAmount(addr1)).to.be.equal(0);
        });

        it("Should fail if nothing to withdraw", async function () {
            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });

            await expect(domainRegistry.connect(addr2).withdrawDomainHolderReward())
                .to.be.revertedWithCustomError(domainRegistry, "NothingToWithdraw");
        });
    });

    describe("changeDomainHolderReward", function () {
        it("Should change the parent domain reward by the owner", async function () {
            const newDomainHolderReward = ethers.parseUnits("2", PWEI_DECIMAL_PLACES_NUMBER);

            await domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward);

            expect(await domainRegistry.domainHolderReward()).to.equal(newDomainHolderReward);
        });

        it("Should fail if not called by the owner", async function () {
            const newDomainHolderReward = ethers.parseUnits("2", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(addr1).changeDomainHolderReward(newDomainHolderReward))
                .to.be.revertedWithCustomError(domainRegistry, "OwnableUnauthorizedAccount");
        });

        it("Should fail if fee is less then 0", async function () {
            const newDomainHolderReward = ethers.parseUnits("0", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward))
                .to.be.revertedWithCustomError(domainRegistry, "DomainHolderRewardMustBeGreaterThanZero");
        });

        it("Should fail if fee is equal to current", async function () {
            const newDomainHolderReward = ethers.parseUnits("1", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward))
                .to.be.revertedWithCustomError(domainRegistry, "NewDomainHolderRewardMustDifferFromCurrent");
        });
    });

    describe("isDomainRegistered", function () {
        it("Should check if domain is registered", async function () {
            const domainName = "com";

            await domainRegistry.connect(addr1).registerDomain(domainName, { value: registrationFee });

            expect(await domainRegistry.isDomainRegistered("com")).to.equal(true);
            expect(await domainRegistry.isDomainRegistered("ua")).to.equal(false);
        });
    });

    describe("getTotalDomainRewardAmount", function () {
        it("Should return right total parent domain reward amount", async function () {
            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("org.com", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("ua.com", { value: registrationFee });
            const totalDomainHolderRewardAmount = parentDomainHolderRewardAmount * BigInt(2);

            expect(await domainRegistry.getAddressRewardAmount(addr1)).to.equal(totalDomainHolderRewardAmount);
        });
    });

    describe("changeRegistrationFee", function () {
        it("Should change the registration fee by the owner", async function () {
            const newRegistrationFee = ethers.parseUnits("10", PWEI_DECIMAL_PLACES_NUMBER);

            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            expect(await domainRegistry.registrationFee()).to.equal(newRegistrationFee);
        });

        it("Should fail if not called by the owner", async function () {
            const newRegistrationFee = ethers.parseUnits("10", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(addr1).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "OwnableUnauthorizedAccount");
        });

        it("Should fail if fee is less then 0", async function () {
            const newRegistrationFee = ethers.parseUnits("0", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "RegistrationFeeMustBeGreaterThanZero");
        });

        it("Should fail if fee is equal to current", async function () {
            const newRegistrationFee = ethers.parseUnits("15", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "NewRegistrationFeeMustDifferFromCurrent");
        });
    });

    describe("withdrawFees", function () {
        it("Should allow the owner to withdraw fees", async function () {
            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("org", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("ua", { value: registrationFee });
            const totalRegistrationFee = registrationFee * BigInt(3);

            const initialOwnerAccountBalance = await ethers.provider.getBalance(owner.address);

            const transaction = await domainRegistry.connect(owner).withdrawFees();
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice;

            const ownerAccountBalanceAfterWithdraw = await ethers.provider.getBalance(owner.address)

            expect(ownerAccountBalanceAfterWithdraw).to.be.equal(
                initialOwnerAccountBalance + totalRegistrationFee - gasUsed
            );
        });

        it("Should withdraw correct fees according to domain holder Rewards", async function () {
            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("org.com", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("ua.org.com", { value: registrationFee });
            const totalRegistrationFee = registrationFee * BigInt(3);
            const totaldomainHolderRewards = parentDomainHolderRewardAmount * BigInt(2);

            const initialOwnerAccountBalance = await ethers.provider.getBalance(owner);

            const transaction = await domainRegistry.connect(owner).withdrawFees();
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice;

            const ownerAccountBalanceAfterWithdraw = await ethers.provider.getBalance(owner)

            expect(ownerAccountBalanceAfterWithdraw).to.be.equal(
                initialOwnerAccountBalance + totalRegistrationFee - totaldomainHolderRewards - gasUsed
            );
        });

        it("Should fail if not called by the owner", async function () {
            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });

            await expect(domainRegistry.connect(addr1).withdrawFees())
                .to.be.revertedWithCustomError(domainRegistry, "OwnableUnauthorizedAccount");
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
            await domainRegistry.connect(owner).registerDomain("com", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("org", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("ua", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("edu", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("net", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("gov", { value: registrationFee });

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

        it("RegistrationFeeChanged", async function () {
            let newRegistrationFee = ethers.parseUnits("12", PWEI_DECIMAL_PLACES_NUMBER);
            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            newRegistrationFee = ethers.parseUnits("14", PWEI_DECIMAL_PLACES_NUMBER);
            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            const filter = domainRegistry.filters.RegistrationFeeChanged();

            let events = await domainRegistry.queryFilter(filter);

            console.log("All changed fee events:");
            await logEvents(events);
        });

        it("DomainHolderRewarded and DomainHolderRewardWithdrawn", async function () {
            await domainRegistry.connect(owner).registerDomain("com", { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain("org.com", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("ua.org.com", { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain("dev.org.com", { value: registrationFee });

            await domainRegistry.connect(owner).withdrawDomainHolderReward();
            await domainRegistry.connect(addr1).withdrawDomainHolderReward();

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
            let newDomainHolderReward = ethers.parseUnits("2", PWEI_DECIMAL_PLACES_NUMBER);
            await domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward);

            newDomainHolderReward = ethers.parseUnits("3", PWEI_DECIMAL_PLACES_NUMBER);
            await domainRegistry.connect(owner).changeDomainHolderReward(newDomainHolderReward);

            const filter = domainRegistry.filters.DomainHolderRewardChanged();

            let events = await domainRegistry.queryFilter(filter);

            console.log("All changed domain holder reward events:");
            await logEvents(events);
        });

    });
});
