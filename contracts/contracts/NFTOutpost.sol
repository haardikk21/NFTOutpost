//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract NFTOutpost is ERC721Holder, ReentrancyGuard {
    using SafeMath for uint256;

    enum Status {
        CREATED,
        DELETED,
        COMPLETED
    }

    struct Bundle {
        // Bundle ID
        uint256 id;
        // Owner of the bundle
        address creator;
        // Array of token addresses
        address[] tokenAddresses;
        // Array of token Id's or amounts
        uint256[] tokenIdsOrAmounts;
        // Status of bundle
        Status status;
    }

    struct Offer {
        // Offer ID
        uint256 id;
        // Bundle ID
        uint256 bundleId;
        // Owner of the offer
        address offerer;
        // Array of token addresses
        address[] tokenAddresses;
        // Array of token Id's or amounts
        uint256[] tokenIdsOrAmounts;
        // Status of offer
        Status status;
    }

    uint256 public numBundles;
    uint256 public numOffers;

    // Bundle ID to Bundle mapping
    mapping(uint256 => Bundle) public _bundles;
    // Offer ID to Offer mapping
    mapping(uint256 => Offer) public _offers;
    // Bundle ID to Offer ID's mapping
    mapping(uint256 => uint256[]) public _offersOnBundles;

    event BundleCreated(
        uint256 indexed id,
        address indexed creator,
        uint256 indexed bundleId,
        address[] tokenAddresses,
        uint256[] tokenIdsOrAmounts
    );
    event BundleDeleted(uint256 indexed id);
    event OfferCreated(
        uint256 indexed bundleId,
        address indexed offerer,
        address[] tokenAddresses,
        uint256[] tokenIdsOrAmounts
    );
    event OfferDeleted(uint256 indexed id);

    /// @notice Creates a new bundle with the given tokens
    /// @param tokenAddresses - array of ERC20 or ERC721 contract addresses
    /// @param tokenIdsOrAmounts - array of ERC20 token amounts or ERC721 token id's
    /// @return Bundle ID
    function createBundle(
        address[] memory tokenAddresses,
        uint256[] memory tokenIdsOrAmounts
    ) external returns (uint256) {
        require(
            tokenAddresses.length == tokenIdsOrAmounts.length,
            "NFTOutpost: different lengths"
        );

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            _sendERC20OrERC721(
                tokenAddresses[i],
                tokenIdsOrAmounts[i],
                msg.sender,
                address(this)
            );
        }

        Bundle memory newBundle = Bundle({
            id: numBundles,
            creator: msg.sender,
            tokenAddresses: tokenAddresses,
            tokenIdsOrAmounts: tokenIdsOrAmounts,
            status: Status.CREATED
        });

        _bundles[numBundles] = newBundle;
        numBundles++;

        return numBundles - 1;
    }

    /// @notice Deletes a bundle with the given ID
    /// @param bundleId - Bundle ID
    function deleteBundle(uint256 bundleId) external {
        Bundle memory bundle = _bundles[bundleId];
        require(
            bundle.creator == msg.sender,
            "NFTOutpost: you are not the creator of this bundle"
        );
        require(
            bundle.status == Status.CREATED,
            "NFTOutpost: bundle has already been swapped or deleted"
        );

        for (uint256 i = 0; i < bundle.tokenAddresses.length; i++) {
            _sendERC20OrERC721(
                bundle.tokenAddresses[i],
                bundle.tokenIdsOrAmounts[i],
                address(this),
                bundle.creator
            );
        }

        _bundles[bundleId].status = Status.DELETED;
    }

    /// @notice Creates a new offer with the given tokens
    /// @param bundleId - Bundle ID to create the offer for
    /// @param tokenAddresses - array of ERC20 or ERC721 contract addresses
    /// @param tokenIdsOrAmounts - array of ERC20 token amounts or ERC721 token id's
    /// @return Offer ID
    function createOffer(
        uint256 bundleId,
        address[] memory tokenAddresses,
        uint256[] memory tokenIdsOrAmounts
    ) external returns (uint256) {
        require(
            tokenAddresses.length == tokenIdsOrAmounts.length,
            "NFTOutpost: different lengths"
        );

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            _sendERC20OrERC721(
                tokenAddresses[i],
                tokenIdsOrAmounts[i],
                msg.sender,
                address(this)
            );
        }

        Offer memory newOffer = Offer({
            id: numOffers,
            bundleId: bundleId,
            offerer: msg.sender,
            tokenAddresses: tokenAddresses,
            tokenIdsOrAmounts: tokenIdsOrAmounts,
            status: Status.CREATED
        });

        _offers[numOffers] = newOffer;
        numOffers++;

        _offersOnBundles[bundleId].push(numOffers - 1);
        return numOffers - 1;
    }

    /// @notice Deletes an offer with the given ID
    /// @param offerId - Offer ID
    function deleteOffer(uint256 offerId) external {
        Offer memory offer = _offers[offerId];
        require(
            offer.offerer == msg.sender,
            "NFTOutpost: you are not the offerer"
        );
        require(
            offer.status == Status.CREATED,
            "NFTOutpost: offer has already been swapped or deleted"
        );

        for (uint256 i = 0; i < offer.tokenAddresses.length; i++) {
            _sendERC20OrERC721(
                offer.tokenAddresses[i],
                offer.tokenIdsOrAmounts[i],
                address(this),
                offer.offerer
            );
        }

        for (uint256 i = 0; i < _offersOnBundles[offer.bundleId].length; i++) {
            uint256[] storage offersOnThisBundle = _offersOnBundles[
                offer.bundleId
            ];
            if (offersOnThisBundle[i] == offerId) {
                offersOnThisBundle[i] = offersOnThisBundle[
                    offersOnThisBundle.length - 1
                ];
                offersOnThisBundle.pop();
                break;
            }
        }

        _offers[offerId].status = Status.DELETED;
    }

    /// @notice Accepts an offer on a bundle
    /// @param bundleId - Bundle ID
    /// @param offerId - Offer ID
    function acceptOffer(uint256 bundleId, uint256 offerId) external {
        Bundle memory bundle = _bundles[bundleId];
        require(
            bundle.creator == msg.sender,
            "NFTOutpost: you are not the creator"
        );
        require(
            bundle.status == Status.CREATED,
            "NFTOutpost: bundle has already been swapped or deleted"
        );

        Offer memory offer = _offers[offerId];
        require(
            offer.status == Status.CREATED,
            "NFTOutpost: offer has already been swapped or deleted"
        );
        require(offer.bundleId == bundleId, "NFTOutpost: invalid offer");

        // Send all tokens in offer to bundle creator
        for (uint256 i = 0; i < offer.tokenAddresses.length; i++) {
            _sendERC20OrERC721(
                offer.tokenAddresses[i],
                offer.tokenIdsOrAmounts[i],
                address(this),
                bundle.creator
            );
        }

        // Send all tokens in bundle to offerer
        for (uint256 i = 0; i < bundle.tokenAddresses.length; i++) {
            _sendERC20OrERC721(
                bundle.tokenAddresses[i],
                bundle.tokenIdsOrAmounts[i],
                address(this),
                offer.offerer
            );
        }

        // Mark bundle and offer as completed
        _bundles[bundleId].status = Status.COMPLETED;
        _offers[offerId].status = Status.COMPLETED;
    }

    // Helpers
    function _sendERC20OrERC721(
        address tokenAddress,
        uint256 tokenIdOrAmount,
        address from,
        address to
    ) internal {
        if (from == address(this)) {
            try IERC20(tokenAddress).transfer(to, tokenIdOrAmount) {} catch {
                IERC721(tokenAddress).transferFrom(from, to, tokenIdOrAmount);
            }
        } else {
            IERC721(tokenAddress).transferFrom(from, to, tokenIdOrAmount);
        }
    }
}
