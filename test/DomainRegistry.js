const { ethers } = require("hardhat");
const { expect } = require("chai");


describe("DomainRegistry", function () {
    const MAX_CONTROLLER_DOMAINS_SEARCH_LIMIT = 100;
    const MAX_DOMAIN_LENGTH = 32;
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

            const addr1ControllerDomains = await domainRegistry.getControllerDomains(addr1.address, 0, 10);
            expect(addr1ControllerDomains[0]).to.be.equal(domainName);
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

            const addr1ControllerDomains = await domainRegistry.getControllerDomains(addr1.address, 0, 10);
            expect(addr1ControllerDomains[0]).to.be.equal(firstDomainName);
            expect(addr1ControllerDomains[1]).to.be.equal(secondDomainName);
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

    describe("getControllerDomainsNumber", function () {
        it("Should get owner domains number", async function () {
            const firstDomainName = "com";
            const secondDomainName = "org";
            const thirdDomainName = "ua";

            await domainRegistry.connect(addr1).registerDomain(firstDomainName, { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain(secondDomainName, { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain(thirdDomainName, { value: registrationFee });

            const ownerControllerDomainsNumber = await domainRegistry.getControllerDomainsNumber(owner.address);
            const addr1ControllerDomainsNumber = await domainRegistry.getControllerDomainsNumber(addr1.address);
            const addr2ControllerDomainsNumber = await domainRegistry.getControllerDomainsNumber(addr2.address);

            expect(ownerControllerDomainsNumber).to.be.equal(0);
            expect(addr1ControllerDomainsNumber).to.be.equal(2);
            expect(addr2ControllerDomainsNumber).to.be.equal(1);
        });
    });

    describe("getControllerDomains", function () {
        it("Should get owner domains", async function () {
            const firstDomainName = "com";
            const secondDomainName = "org";
            const thirdDomainName = "ua";

            await domainRegistry.connect(addr1).registerDomain(firstDomainName, { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain(secondDomainName, { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain(thirdDomainName, { value: registrationFee });

            const ownerControllerDomains = await domainRegistry.getControllerDomains(owner.address, 0, 10);
            const addr1ControllerDomains = await domainRegistry.getControllerDomains(addr1.address, 0, 20);
            const addr2ControllerDomains = await domainRegistry.getControllerDomains(addr2.address, 0, 100);

            expect(ownerControllerDomains.length).to.be.equal(0);
            expect(addr1ControllerDomains.length).to.be.equal(2);
            expect(addr2ControllerDomains.length).to.be.equal(1);

            expect(addr1ControllerDomains[0]).to.be.equal(firstDomainName);

            expect(addr1ControllerDomains[1]).to.be.equal(secondDomainName);

            expect(addr2ControllerDomains[0]).to.be.equal(thirdDomainName);
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
