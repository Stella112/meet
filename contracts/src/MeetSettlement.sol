// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MeetSettlement
/// @notice Pays a naira obligation atomically: pulls at most the signed USDT from the owner and
/// delivers exactly the signed cNGN to the recipient. Holds no funds between transactions.
contract MeetSettlement is EIP712, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Obligation {
        address owner; // signer; pays sellToken
        address recipient; // payee; receives buyToken
        address sellToken;
        address buyToken;
        uint256 buyAmount; // exact amount the recipient must get
        uint256 maxSellAmount; // worst case the owner pays, fee included
        uint64 validAfter;
        uint64 expiry;
        uint256 nonce;
    }

    bytes32 public constant OBLIGATION_TYPEHASH = keccak256(
        "Obligation(address owner,address recipient,address sellToken,address buyToken,uint256 buyAmount,uint256 maxSellAmount,uint64 validAfter,uint64 expiry,uint256 nonce)"
    );
    uint16 public constant MAX_FEE_BPS = 30;
    uint256 private constant BPS = 10_000;

    address public immutable sellToken;
    address public immutable buyToken;
    address public immutable treasury;
    uint16 public immutable feeBps;

    address public solver;

    mapping(address owner => mapping(uint256 nonce => bool)) public cancelled;
    mapping(address owner => mapping(uint256 nonce => bool)) public used;

    event Paid(address indexed owner, address indexed recipient, uint256 nonce, uint256 sellAmount, uint256 buyAmount);
    event Cancelled(address indexed owner, uint256 nonce);
    event SolverSet(address solver);

    error NotSolver();
    error ZeroAddress();
    error ZeroAmount();
    error SameToken();
    error FeeTooHigh();
    error TokenNotAllowed();
    error BadSignature();
    error NotYetValid();
    error Expired();
    error NonceCancelled();
    error NonceUsed();
    error AboveMax();

    constructor(
        address sellToken_,
        address buyToken_,
        address owner_,
        address solver_,
        address treasury_,
        uint16 feeBps_
    ) EIP712("MeetSettlement", "1") Ownable(owner_) {
        if (sellToken_ == address(0) || buyToken_ == address(0) || solver_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (sellToken_ == buyToken_) revert SameToken();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        sellToken = sellToken_;
        buyToken = buyToken_;
        solver = solver_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    /// @notice Solver only. `sellAmount` is the owner's total cost, fee included.
    /// `supplier` provides the buyToken and must have approved this contract.
    function settle(Obligation calldata o, bytes calldata sig, uint256 sellAmount, address supplier)
        external
        nonReentrant
        whenNotPaused
    {
        if (msg.sender != solver) revert NotSolver();
        if (o.recipient == address(0) || supplier == address(0)) revert ZeroAddress();
        if (sellAmount == 0 || o.buyAmount == 0) revert ZeroAmount();
        if (o.sellToken != sellToken || o.buyToken != buyToken) revert TokenNotAllowed();
        if (block.timestamp < o.validAfter) revert NotYetValid();
        if (block.timestamp >= o.expiry) revert Expired();
        if (cancelled[o.owner][o.nonce]) revert NonceCancelled();
        if (used[o.owner][o.nonce]) revert NonceUsed();
        if (sellAmount > o.maxSellAmount) revert AboveMax();
        if (!SignatureChecker.isValidSignatureNowCalldata(o.owner, hashObligation(o), sig)) revert BadSignature();

        used[o.owner][o.nonce] = true;
        emit Paid(o.owner, o.recipient, o.nonce, sellAmount, o.buyAmount);

        // Fee comes out of sellAmount, so the owner never pays more than maxSellAmount.
        uint256 fee = (sellAmount * feeBps) / BPS;
        IERC20(o.sellToken).safeTransferFrom(o.owner, supplier, sellAmount - fee);
        if (fee != 0) IERC20(o.sellToken).safeTransferFrom(o.owner, treasury, fee);
        IERC20(o.buyToken).safeTransferFrom(supplier, o.recipient, o.buyAmount);
    }

    /// @notice Cancels the caller's obligation with this nonce. Works while paused.
    function cancel(uint256 nonce) external {
        cancelled[msg.sender][nonce] = true;
        emit Cancelled(msg.sender, nonce);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setSolver(address solver_) external onlyOwner {
        if (solver_ == address(0)) revert ZeroAddress();
        solver = solver_;
        emit SolverSet(solver_);
    }

    function hashObligation(Obligation calldata o) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(OBLIGATION_TYPEHASH, o)));
    }
}
