const { ethers } = require("hardhat");
const { expect } = require("chai");


describe("DomainRegistry", function () {
    const PWEI_DECIMAL_PLACES_NUMBER = 15;
    const registrationFee = ethers.parseUnits("15", PWEI_DECIMAL_PLACES_NUMBER);

    let domainRegistry
    let owner, addr1, addr2;

    beforeEach(async function () {
        const DomainRegistry = await ethers.getContractFactory("DomainRegistry");
        [owner, addr1, addr2] = await ethers.getSigners();
        domainRegistry = await DomainRegistry.deploy(registrationFee);
    });

    describe("Deployment", function () {
        it("Should set the right owner and registration fee", async function () {
            expect(await domainRegistry.owner()).to.equal(owner.address);
            expect(await domainRegistry.registrationFee()).to.equal(registrationFee);
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
            const secondDomainName = "org";

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
    });

    describe("changeRegistrationFee", function () {
        it("Should change the registration fee by the owner", async function () {
            const PWEI_DECIMAL_PLACES_NUMBER = 15;
            const newRegistrationFee = ethers.parseUnits("10", PWEI_DECIMAL_PLACES_NUMBER);

            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            expect(await domainRegistry.registrationFee()).to.equal(newRegistrationFee);
        });

        it("Should fail if not called by the owner", async function () {
            const PWEI_DECIMAL_PLACES_NUMBER = 15;
            const newRegistrationFee = ethers.parseUnits("10", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(addr1).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "OnlyOwnerCanCall");
        });

        it("Should fail if fee is less then 0", async function () {
            const PWEI_DECIMAL_PLACES_NUMBER = 15;
            const newRegistrationFee = ethers.parseUnits("0", PWEI_DECIMAL_PLACES_NUMBER);

            await expect(domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWithCustomError(domainRegistry, "RegistrationFeeMustBeGreaterThanZero");
        });

        it("Should fail if fee is equal to current", async function () {
            const PWEI_DECIMAL_PLACES_NUMBER = 15;
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

            expect(ownerAccountBalanceAfterWithdraw).to.be.equal(initialOwnerAccountBalance + totalRegistrationFee - gasUsed);
        });

        it("Should fail if not called by the owner", async function () {
            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });

            await expect(domainRegistry.connect(addr1).withdrawFees())
                .to.be.revertedWithCustomError(domainRegistry, "OnlyOwnerCanCall");
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

        async function logDomainRegisteredEvents(events) {
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
            await logDomainRegisteredEvents(events);

            console.log("Registered domain by a concrete controllers filter by date: ");

            const controllers = [owner, addr1, addr2];

            controllers.map(async controller => {
                const events = await getControllerRegisteredDomains(controller.address);
                console.log("Controller address: ", controller.address);
                await logDomainRegisteredEvents(events);
            });

        });

        it("RegistrationFeeChanged", async function () {
            const PWEI_DECIMAL_PLACES_NUMBER = 15;
            let newRegistrationFee = ethers.parseUnits("12", PWEI_DECIMAL_PLACES_NUMBER);
            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            newRegistrationFee = ethers.parseUnits("14", PWEI_DECIMAL_PLACES_NUMBER);
            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            const filter = domainRegistry.filters.RegistrationFeeChanged();

            let events = await domainRegistry.queryFilter(filter);

            console.log("All changed fee events:");
            await logDomainRegisteredEvents(events);
        });
    });
});
