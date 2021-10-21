import BN from 'bn.js';
import { expect } from 'chai';
import { patract, network, artifacts } from 'redspot';

const { getContractFactory, getRandomSigner } = patract;

const { api, getSigners } = network;

const testVault = "QmPvNDeFhpN5WxLmnQ7f2WS7si3CtF1qr5VorDg6E1EL2A"
const newMetadata = [
  "QmVV1agVZ7zgHToMBWEkzqgCU4SmUPr17GmHUg7sV6UTZc",
  "QmY18PQMFhuc4b9MbAzpu595FvbasyfuNAe6mEQDENAtcU",
  "QmbG97XZdG3FvcheY1jxUfA2F29mLkmRoD7JQtrv2919Gn",
  "QmRvWsEa898wucJyyFPPMcNKmQfLysZdNyJ6JNyuwJ9KZE"
]

// Smart Contract
describe('SkyeKiwi Smart Contract', () => {
  after(() => {
    return api.disconnect();
  });

  async function setup() {
    const one = new BN(10).pow(new BN(api.registry.chainDecimals[0]));
    const signers = await getSigners();
    const Alice = signers[0];

    const sender1 = await getRandomSigner(Alice, one.muln(10000));
    const sender2 = await getRandomSigner(Alice, one.muln(10000));
    const sender3 = await getRandomSigner(Alice, one.muln(10000));
    const sender4 = await getRandomSigner(Alice, one.muln(10000));

    const contractFactory = await getContractFactory('skyekiwi', sender1);
    const contract = await contractFactory.deploy('new');

    const abi = artifacts.readArtifact('skyekiwi');
    const receiver = await getRandomSigner();

    return { sender1, sender2, sender3, sender4, contractFactory, contract, abi, receiver, Alice, one };
  }

  let badAuthResult
  let badMetadataResult

  // basic functionalities
  it('creates a new vault & assign caller as owner', async () => {
    const { contract, sender1 } = await setup();

    expect((await contract.query.authorizeOwner(0, sender1.address)).output).to.equal(false)

    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    const owner = await contract.query.ownerOf(0)
    expect(owner.output).to.equal(sender1.address)
    expect((await contract.query.authorizeOwner(0, sender1.address)).output).to.equal(true)
  })

  it('adds a member to a vault & remove a member to a vault', async () => {
    const { contract, sender1, sender2 } = await setup();

    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
    await expect(contract.connect(sender1).tx.nominateMember(0, sender2.address))
      .to.emit(contract, "MemembershipGranted")
      .withArgs(0, sender1.address, sender2.address)

    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)

    await expect(contract.connect(sender1).tx.removeMember(0, sender2.address))
      .to.emit(contract, "MembershipRevoked")
      .withArgs(0, sender1.address, sender2.address)

    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
  })

  it('queries & updates a metadata of a vault', async () => {
    const { contract, sender1 } = await setup();

    // valid CID
    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)
    expect((await contract.query.getMetadata(0)).output).to.equal(testVault)

    // invalid CID
    // "the dirty method" as in https://github.com/patractlabs/redspot/issues/78
    badMetadataResult = await contract.connect(sender1).query.createVault("bad metadata")
    expect(badMetadataResult.output?.toHuman().Err).to.equal('MetadataNotValid')

    // valid CID Update
    await expect(contract.connect(sender1).tx.updateMetadata(0, newMetadata[0]))
      .to.emit(contract, 'VaultUpdate')
      .withArgs(0, sender1.address)

    expect((await contract.query.getMetadata(0)).output).to.equal(newMetadata[0])

    // invalid CID Update
    // "the dirty method" as in https://github.com/patractlabs/redspot/issues/78
    badMetadataResult = await contract.connect(sender1).query.updateMetadata(0, "bad metadata")
    expect(badMetadataResult.output?.toHuman().Err).to.equal('MetadataNotValid')
  })

  it('deletes a vault', async () => {
    const { contract, sender1 } = await setup();
    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    expect((await contract.query.getMetadata(0)).output).to.equal(testVault)
    expect((await contract.query.authorizeOwner(0, sender1.address)).output).to.equal(true)

    await expect(contract.connect(sender1).tx.burnVault(0))
      .to.emit(contract, 'VaultBurnt')
      .withArgs(0, sender1.address)

    expect((await contract.query.getMetadata(0)).output?.toHuman()).to.be.oneOf([null, false])
    expect((await contract.query.authorizeOwner(0, sender1.address)).output?.toHuman()).to.be.oneOf([null, false])

  })

  // authorizations 
  it('only allows members or owner to update metadata', async () => {
    const { contract, sender1, sender2, sender3 } = await setup();

    // sender1 creates a vault
    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    expect((await contract.query.getMetadata(0)).output).to.equal(testVault)

    // sender1 can update the metadata
    await expect(contract.connect(sender1).tx.updateMetadata(0, newMetadata[0]))
      .to.emit(contract, 'VaultUpdate')
      .withArgs(0, sender1.address)
    expect((await contract.query.getMetadata(0)).output).to.equal(newMetadata[0])

    // sender1 nominated sender2 to be a member
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
    await expect(contract.connect(sender1).tx.nominateMember(0, sender2.address))
      .to.emit(contract, "MemembershipGranted")
      .withArgs(0, sender1.address, sender2.address)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)

    // sender2 & sender 1 can update the metadata, while sender3 cannot

    await expect(contract.connect(sender1).tx.updateMetadata(0, newMetadata[1]))
      .to.emit(contract, 'VaultUpdate')
      .withArgs(0, sender1.address)


    expect((await contract.query.getMetadata(0)).output).to.equal(newMetadata[1])
    await expect(contract.connect(sender2).tx.updateMetadata(0, newMetadata[2]))
      .to.emit(contract, 'VaultUpdate')
      .withArgs(0, sender2.address)

    expect((await contract.query.getMetadata(0)).output).to.equal(newMetadata[2])


    await expect(contract.connect(sender3).tx.updateMetadata(0, newMetadata[3]))
      .to.not.emit(contract, 'VaultUpdate')

    badAuthResult = await contract.connect(sender3).query.updateMetadata(0, newMetadata[3])
    expect(badAuthResult.output?.toHuman().Err).to.equal('AccessDenied')

    expect((await contract.query.getMetadata(0)).output).to.equal(newMetadata[2])
  })

  it('only allows owner to nominate members', async () => {
    const { contract, sender1, sender2, sender3, sender4 } = await setup();

    // sender1 creates a vault
    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    expect((await contract.query.getMetadata(0)).output).to.equal(testVault)

    // sender1 nominated sender2 to be a member
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
    await expect(contract.connect(sender1).tx.nominateMember(0, sender2.address))
      .to.emit(contract, "MemembershipGranted")
      .withArgs(0, sender1.address, sender2.address)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)


    // sender 2 cannot nominate another member
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(false)

    badAuthResult = await contract.connect(sender2).query.nominateMember(0, sender3.address)
    expect(badAuthResult.output?.toHuman().Err).to.equal('AccessDenied')

    await expect(contract.connect(sender2).tx.nominateMember(0, sender3.address))
      .to.not.emit(contract, "MemembershipGranted")
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(false)

    // others cannot nominate other members    
    badAuthResult = await contract.connect(sender3).query.nominateMember(0, sender4.address)
    expect(badAuthResult.output?.toHuman().Err).to.equal('AccessDenied')

    await expect(contract.connect(sender3).tx.nominateMember(0, sender4.address))
      .to.not.emit(contract, "MemembershipGranted")
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(false)
    expect((await contract.query.authorizeMember(0, sender4.address)).output).to.equal(false)
  })

  it('only allows owner to remove members', async () => {
    const { contract, sender1, sender2, sender3, sender4 } = await setup();

    // sender1 creates a vault
    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    expect((await contract.query.getMetadata(0)).output).to.equal(testVault)

    // sender1 nominated sender2 to be a member
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
    await expect(contract.connect(sender1).tx.nominateMember(0, sender2.address))
      .to.emit(contract, "MemembershipGranted")
      .withArgs(0, sender1.address, sender2.address)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)

    // sender1 nominated sender3 to be a member
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(false)
    await expect(contract.connect(sender1).tx.nominateMember(0, sender3.address))
      .to.emit(contract, "MemembershipGranted")
      .withArgs(0, sender1.address, sender3.address)
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(true)

    // sender 2 cannot remove sender3 as a member
    expect((await contract.query.authorizeOwner(0, sender2.address)).output).to.equal(false)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(true)

    badAuthResult = await contract.connect(sender2).query.removeMember(0, sender3.address)
    expect(badAuthResult.output?.toHuman().Err).to.equal('AccessDenied')
    await expect(contract.connect(sender2).tx.removeMember(0, sender3.address))
      .to.not.emit(contract, "MembershipRevoked")

    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(true)

    // others cannot remove members
    expect((await contract.query.authorizeOwner(0, sender2.address)).output).to.equal(false)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(true)
    expect((await contract.query.authorizeMember(0, sender4.address)).output).to.equal(false)

    badAuthResult = await contract.connect(sender4).query.removeMember(0, sender3.address)
    expect(badAuthResult.output?.toHuman().Err).to.equal('AccessDenied')
    await expect(contract.connect(sender4).tx.removeMember(0, sender3.address))
      .to.not.emit(contract, "MembershipRevoked")
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(true)

    // sender1 can remove members
    expect((await contract.query.authorizeOwner(0, sender1.address)).output).to.equal(true)
    expect((await contract.query.authorizeOwner(0, sender2.address)).output).to.equal(false)
    expect((await contract.query.authorizeOwner(0, sender3.address)).output).to.equal(false)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(true)
    await expect(contract.connect(sender1).tx.removeMember(0, sender2.address))
      .to.emit(contract, "MembershipRevoked")
      .withArgs(0, sender1.address, sender2.address)
    await expect(contract.connect(sender1).tx.removeMember(0, sender3.address))
      .to.emit(contract, "MembershipRevoked")
      .withArgs(0, sender1.address, sender3.address)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(false)
  })

  it('only allows members or owner to change to their own vault', async () => {
    const { contract, sender1, sender2, sender3, sender4 } = await setup();

    // sender1 creates a vault & sender2 creates another vault
    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    await expect(contract.connect(sender2).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(1, sender2.address)

    expect((await contract.query.ownerOf(0)).output).to.equal(sender1.address)
    expect((await contract.query.ownerOf(1)).output).to.equal(sender2.address)

    // sender1 cannot touch another vault
    expect((await contract.query.authorizeMember(1, sender1.address)).output).to.equal(false)
    expect((await contract.query.authorizeOwner(1, sender1.address)).output).to.equal(false)

    // sender2 cannot touch another vault
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
    expect((await contract.query.authorizeOwner(0, sender2.address)).output).to.equal(false)
  })

  it('only allows owner to burn vaults', async () => {
    const { contract, sender1, sender2, sender3 } = await setup();

    // sender1 creates a vault
    await expect(contract.connect(sender1).tx.createVault(testVault))
      .to.emit(contract, 'VaultCreation')
      .withArgs(0, sender1.address)

    expect((await contract.query.ownerOf(0)).output).to.equal(sender1.address)

    // sender1 nominated sender2 to be a member
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(false)
    await expect(contract.connect(sender1).tx.nominateMember(0, sender2.address))
      .to.emit(contract, "MemembershipGranted")
      .withArgs(0, sender1.address, sender2.address)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)

    // sender 1 can burn a vault, while sender2 or others cannot
    expect((await contract.query.authorizeOwner(0, sender1.address)).output).to.equal(true)
    expect((await contract.query.authorizeMember(0, sender2.address)).output).to.equal(true)
    expect((await contract.query.authorizeMember(0, sender3.address)).output).to.equal(false)

    badAuthResult = await contract.connect(sender2).query.burnVault(0)
    expect(badAuthResult.output?.toHuman().Err).to.equal('AccessDenied')
    await expect(contract.connect(sender2).tx.burnVault(0))
      .to.not.emit(contract, "VaultBurnt")

    badAuthResult = await contract.connect(sender3).query.burnVault(0)
    expect(badAuthResult.output?.toHuman().Err).to.equal('AccessDenied')
    await expect(contract.connect(sender3).tx.burnVault(0))
      .to.not.emit(contract, "VaultBurnt")
    await expect(contract.connect(sender1).tx.burnVault(0))
      .to.emit(contract, 'VaultBurnt')
      .withArgs(0, sender1.address)
  })
})
