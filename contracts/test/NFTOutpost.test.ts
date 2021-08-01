import { expect } from "chai";
import { BigNumber, Contract, Signer, Transaction } from "ethers";
import { SquigglesABI, USDCABI } from "./abis";
// @ts-ignore
import { network, ethers } from "hardhat";

const addresses: Record<string, string> = {
  squigglesContract: "0x059EDD72Cd353dF5106D2B9cC5ab83a52287aC3a".toLowerCase(),
  usdcContract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".toLowerCase(),
  snowfro: "0xf3860788D1597cecF938424bAABe976FaC87dC26".toLowerCase(),
  randomSquiggleHolder:
    "0x42f3f76ba5202d7a4c48fd428b5613c657689bcc".toLowerCase(),
};

let NFTOutpost: Contract;
let NFTOutpostAddress: string;

async function deploy() {
  const NFTOutpostContract = await ethers.getContractFactory("NFTOutpost");
  const snowfroSigner: Signer = await impersonateSigner(addresses.snowfro);
  const NFTOutpostSigner = NFTOutpostContract.connect(snowfroSigner);
  const contract = await NFTOutpostSigner.deploy();
  await contract.deployed();

  NFTOutpost = contract;
  NFTOutpostAddress = contract.address.toString().toLowerCase();
}

async function getSquigglesContractWithSigner(
  signerAddress: string
): Promise<Contract> {
  const signer = await impersonateSigner(signerAddress);
  return new ethers.Contract(addresses.squigglesContract, SquigglesABI, signer);
}

async function getUSDCContractWithSigner(
  signerAddress: string
): Promise<Contract> {
  const signer = await impersonateSigner(signerAddress);
  return new ethers.Contract(addresses.usdcContract, USDCABI, signer);
}

async function createFirstBundle() {
  const snowfroSigner = await impersonateSigner(addresses.snowfro);
  const snowfroOutpost: Contract = NFTOutpost.connect(snowfroSigner);
  const snowfroSquiggles = await getSquigglesContractWithSigner(
    addresses.snowfro
  );
  const snowfroUsdc = await getUSDCContractWithSigner(addresses.snowfro);

  // Approve Squiggle #0 to Outpost contract
  await snowfroSquiggles.approve(NFTOutpostAddress, 0);
  // Approve 1000 USDC spend to Outpost contract
  await snowfroUsdc.approve(NFTOutpostAddress, 1000);

  // Create bundle with Squiggle #0 and 1000 USDC
  await snowfroOutpost.createBundle(
    // token addresses
    [addresses.squigglesContract, addresses.usdcContract],
    // token id's or amounts
    [0, 1000]
  );
}

async function createFirstOffer() {
  const holderSquiggles = await getSquigglesContractWithSigner(
    addresses.randomSquiggleHolder
  );
  const holderOutpost = NFTOutpost.connect(
    await impersonateSigner(addresses.randomSquiggleHolder)
  );
  // Approve holder's squiggles to contract
  await holderSquiggles.setApprovalForAll(NFTOutpostAddress, true);

  // Create offer
  const holderTokenAddresses = [
    addresses.squigglesContract,
    addresses.squigglesContract,
    addresses.squigglesContract,
  ];
  const holderTokenIds = [3003, 8848, 1000042];
  await holderOutpost.createOffer(0, holderTokenAddresses, holderTokenIds);
}

/**
 * Returns impersonated signer
 * @param {string} account to impersonate
 * @returns {Signer} authenticated as account
 * Thanks @AnishAgnihotri
 */
async function impersonateSigner(account: string): Promise<Signer> {
  // Impersonate account
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });

  // Return ethers signer
  return ethers.provider.getSigner(account);
}

describe("NFT Outpost", () => {
  beforeEach(async () => {
    // Reset hardhat forknet
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY_MAINNET}`,
            blockNumber: 12929256,
          },
        },
      ],
    });

    // Deploy contract
    await deploy();

    // Create first bundle
    await createFirstBundle();

    // Create first offer
    await createFirstOffer();
  });

  it("should create a bundle", async () => {
    const snowfroSquiggles = await getSquigglesContractWithSigner(
      addresses.snowfro
    );
    const snowfroUsdc = await getUSDCContractWithSigner(addresses.snowfro);
    const squiggle0Owner: string = await snowfroSquiggles.ownerOf(0);
    const bundleCreator: string = (await NFTOutpost._bundles(0)).creator;

    expect(squiggle0Owner.toLowerCase()).to.equal(NFTOutpostAddress);
    expect(bundleCreator.toLowerCase()).to.equal(addresses.snowfro);
    expect(await snowfroUsdc.balanceOf(NFTOutpostAddress)).to.equal(1000);
  });

  it("should allow creating offers on active bundle", async () => {
    const holderTokenIds = [3003, 8848, 1000042];

    const squigglesContract = await getSquigglesContractWithSigner(
      addresses.snowfro
    );
    for (let tokenId of holderTokenIds) {
      const tokenOwner: string = await squigglesContract.ownerOf(tokenId);
      expect(tokenOwner.toLowerCase()).to.equal(NFTOutpostAddress);
    }

    const offerOfferer: string = (await NFTOutpost._offers(0)).offerer;
    expect(offerOfferer.toLowerCase()).to.equal(addresses.randomSquiggleHolder);
  });

  it("should allow deleting own bundle", async () => {
    const snowfroSigner = await impersonateSigner(addresses.snowfro);
    const snowfroOutpost: Contract = NFTOutpost.connect(snowfroSigner);
    const snowfroSquiggles = await getSquigglesContractWithSigner(
      addresses.snowfro
    );
    const snowfroUsdc = await getUSDCContractWithSigner(addresses.snowfro);

    await snowfroOutpost.deleteBundle(0);

    const bundleStatus: number = (await NFTOutpost._bundles(0)).status;
    const squiggle0Owner: string = await snowfroSquiggles.ownerOf(0);

    expect(bundleStatus).to.equal(1); // 1 === Deleted
    expect(await snowfroUsdc.balanceOf(NFTOutpostAddress)).to.equal(0);
    expect(squiggle0Owner.toLowerCase()).to.equal(addresses.snowfro);
  });

  it("should allow deleting own offer", async () => {
    const holderSigner = await impersonateSigner(
      addresses.randomSquiggleHolder
    );
    const holderOutpost: Contract = NFTOutpost.connect(holderSigner);
    const holderSquiggles = await getSquigglesContractWithSigner(
      addresses.randomSquiggleHolder
    );
    const holderTokenIds = [3003, 8848, 1000042];

    await holderOutpost.deleteOffer(0);

    const offerStatus: number = (await NFTOutpost._offers(0)).status;

    expect(offerStatus).to.equal(1);

    for (let tokenId of holderTokenIds) {
      const tokenOwner: string = await holderSquiggles.ownerOf(tokenId);
      expect(tokenOwner.toLowerCase()).to.equal(addresses.randomSquiggleHolder);
    }
  });

  it("should allow accepting offers", async () => {
    const snowfroSigner = await impersonateSigner(addresses.snowfro);
    const snowfroOutpost: Contract = NFTOutpost.connect(snowfroSigner);
    const snowfroSquiggles = await getSquigglesContractWithSigner(
      addresses.snowfro
    );
    const snowfroUsdc = await getUSDCContractWithSigner(addresses.snowfro);

    // Holder USDC balance prior to offer accepting
    const holderUsdcBalanceBefore: number = await snowfroUsdc.balanceOf(
      addresses.randomSquiggleHolder
    );

    await snowfroOutpost.acceptOffer(0, 0);

    const bundleStatus: number = (await NFTOutpost._bundles(0)).status;
    const offerStatus: number = (await NFTOutpost._offers(0)).status;

    expect(bundleStatus).to.equal(2);
    expect(offerStatus).to.equal(2);

    // Snowfro should have holder token IDs
    const holderTokenIds = [3003, 8848, 1000042];
    for (let tokenId of holderTokenIds) {
      const tokenOwner: string = await snowfroSquiggles.ownerOf(tokenId);
      expect(tokenOwner.toLowerCase()).to.equal(addresses.snowfro);
    }

    // Holder should have Squiggle #0 and +1000 USDC
    const squiggle0Owner: string = await snowfroSquiggles.ownerOf(0);
    expect(squiggle0Owner.toLowerCase()).to.equal(
      addresses.randomSquiggleHolder
    );

    const holderUsdcBalanceAfter: number = await snowfroUsdc.balanceOf(
      addresses.randomSquiggleHolder
    );

    expect(holderUsdcBalanceAfter).to.equal(holderUsdcBalanceBefore + 1000);
  });
});
