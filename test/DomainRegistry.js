const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");


describe("DomainRegistry", function () {
    async function deployDomainRegistryFixture() {
        const PWEI_DECIMAL_PLACES_NUMBER = 15;
        const registrationFee = ethers.parseUnits("15", PWEI_DECIMAL_PLACES_NUMBER); // 15 Finney

        const [owner, addr1, addr2] = await ethers.getSigners();
        const DomainRegistry = await ethers.getContractFactory("DomainRegistry");

        const domainRegistry = await DomainRegistry.deploy(registrationFee);
        await domainRegistry.waitForDeployment();

        return { domainRegistry, registrationFee, owner, addr1, addr2 };
    }

    describe("Deployment", function () {
        it("Should set the right owner and registration fee", async function () {
            const { domainRegistry, registrationFee, owner } = await loadFixture(deployDomainRegistryFixture);

            expect(await domainRegistry.owner()).to.equal(owner.address);
            expect(await domainRegistry.registrationFee()).to.equal(registrationFee);
        });
    });

    describe("registerDomain", function () {
        it("Should register a domain", async function () {
            const { domainRegistry, registrationFee, addr1 } = await loadFixture(deployDomainRegistryFixture);
            const domainName = "com";

            await domainRegistry.connect(addr1).registerDomain(domainName, { value: registrationFee });

            expect(await domainRegistry.domainToController(domainName)).to.equal(addr1.address);
        });

        it("Should take right fee amount", async function () {
            const { domainRegistry, registrationFee, addr1 } = await loadFixture(deployDomainRegistryFixture);
            const domainName = "com";

            const initialAccountBalance = await ethers.provider.getBalance(addr1.address)

            const transaction = await domainRegistry.connect(addr1).registerDomain(domainName, { value: registrationFee });
            const transactionReceipt = await transaction.wait();
            const gasUsed = transactionReceipt.gasUsed * transactionReceipt.gasPrice

            const accountBalanceAfterRegister = await ethers.provider.getBalance(addr1.address)

            expect(initialAccountBalance).to.be.equal(accountBalanceAfterRegister + registrationFee + gasUsed);
        });

        it("Should can register multiple domains", async function () {
            const { domainRegistry, registrationFee, addr1 } = await loadFixture(deployDomainRegistryFixture);
            const firstDomainName = "com";
            const secondDomainName = "org";

            await domainRegistry.connect(addr1).registerDomain(firstDomainName, { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain(secondDomainName, { value: registrationFee });

            expect(await domainRegistry.domainToController(firstDomainName)).to.equal(addr1.address);
            expect(await domainRegistry.domainToController(secondDomainName)).to.equal(addr1.address);
        });

        it("Should fail for incorrect fee", async function () {
            const { domainRegistry, registrationFee, addr1 } = await loadFixture(deployDomainRegistryFixture);
            const domain = "com";

            const incorrectFee = registrationFee - 1n;

            await expect(domainRegistry.connect(addr1).registerDomain(domain, { value: incorrectFee }))
                .to.be.revertedWith("Please submit the correct registration fee");
        });

        it("Should not allow register a domain that is already registered", async function () {
            const { domainRegistry, registrationFee, addr1, addr2 } = await loadFixture(deployDomainRegistryFixture);
            const domainName = "com";

            await domainRegistry.connect(addr1).registerDomain(domainName, { value: registrationFee });

            await expect(domainRegistry.connect(addr2).registerDomain(domainName, { value: registrationFee }))
                 .to.be.revertedWith("Domain is already registered");
        });
    });

    describe("getControllerDomains", function () {
        it("Should get owner domains", async function () {
            const { domainRegistry, registrationFee, owner, addr1, addr2 } = await loadFixture(deployDomainRegistryFixture);
            const firstDomainName = "com";
            const secondDomainName = "org";
            const thirdDomainName = "ua";

            await domainRegistry.connect(addr1).registerDomain(firstDomainName, { value: registrationFee });
            await domainRegistry.connect(addr1).registerDomain(secondDomainName, { value: registrationFee });
            await domainRegistry.connect(addr2).registerDomain(thirdDomainName, { value: registrationFee });

            const ownerControllerDomains = await domainRegistry.getControllerDomains(owner.address);
            const addr1ControllerDomains = await domainRegistry.getControllerDomains(addr1.address);
            const addr2ControllerDomains = await domainRegistry.getControllerDomains(addr2.address);

            expect(ownerControllerDomains.length).to.be.equal(0);
            expect(addr1ControllerDomains.length).to.be.equal(2);
            expect(addr2ControllerDomains.length).to.be.equal(1);

            expect(addr1ControllerDomains[0].name).to.be.equal(firstDomainName);
            expect(addr1ControllerDomains[0].controller).to.be.equal(addr1.address);

            expect(addr1ControllerDomains[1].name).to.be.equal(secondDomainName);
            expect(addr1ControllerDomains[1].controller).to.be.equal(addr1.address);

            expect(addr2ControllerDomains[0].name).to.be.equal(thirdDomainName);
            expect(addr2ControllerDomains[0].controller).to.be.equal(addr2.address);
        });
    });

    describe("changeRegistrationFee", function () {
        it("Should change the registration fee by the owner", async function () {
            const { domainRegistry, owner } = await loadFixture(deployDomainRegistryFixture);

            const PWEI_DECIMAL_PLACES_NUMBER = 15;
            const newRegistrationFee = ethers.parseUnits("10", PWEI_DECIMAL_PLACES_NUMBER); // 10 Finney

            await domainRegistry.connect(owner).changeRegistrationFee(newRegistrationFee);

            expect(await domainRegistry.registrationFee()).to.equal(newRegistrationFee);
        });

        it("Should fail if not called by the owner", async function () {
            const { domainRegistry, addr1 } = await loadFixture(deployDomainRegistryFixture);

            const PWEI_DECIMAL_PLACES_NUMBER = 15;
            const newRegistrationFee = ethers.parseUnits("10", PWEI_DECIMAL_PLACES_NUMBER); // 10 Finney

            await expect(domainRegistry.connect(addr1).changeRegistrationFee(newRegistrationFee))
                .to.be.revertedWith("Only the owner can call this function");
        });
    });

    describe("withdrawFees", function () {
        it("Should allow the owner to withdraw fees", async function () {
            const { domainRegistry, registrationFee, owner, addr1, addr2 } = await loadFixture(deployDomainRegistryFixture);

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
            const { domainRegistry, registrationFee, addr1 } = await loadFixture(deployDomainRegistryFixture);

            await domainRegistry.connect(addr1).registerDomain("com", { value: registrationFee });

            await expect(domainRegistry.connect(addr1).withdrawFees())
                .to.be.revertedWith("Only the owner can call this function");
        });
    });

    describe("DomainRegistered", function () {
        it("", async function () {
            function sortDomainsByRegistrationDate(events) {
                return events.sort((a, b) => a.args.registeredAt - b.args.registeredAt);
            }

            async function getControllerRegisteredDomains(controllerAddress) {
                const filter = domainRegistry.filters.DomainRegistered(null, controllerAddress)

                let events = await domainRegistry.queryFilter(filter);
                events = sortDomainsByRegistrationDate(events);

                return events;
            }

            function logDomainRegisteredEvents(events) {
                events.map(event => {
                    console.log("event.args: ", event.args);
                });
            }

            const { domainRegistry, registrationFee, owner, addr1, addr2 } = await loadFixture(deployDomainRegistryFixture);

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
            logDomainRegisteredEvents(events);

            console.log("Registered domain by a concrete controllers filter by date: ");

            const controllers = [owner, addr1, addr2];

            controllers.map(async controller => {
                const events = await getControllerRegisteredDomains(controller.address);
                console.log("Controller address: ", controller.address);
                logDomainRegisteredEvents(events);
            });

        });
    });
});
