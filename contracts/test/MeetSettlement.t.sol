// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MeetSettlement} from "../src/MeetSettlement.sol";
import {FalseToken, MockToken, ReentrantToken} from "./Mocks.sol";

contract MeetSettlementTest is Test {
    MeetSettlement meet;
    MockToken usdt;
    MockToken cngn;

    address admin = makeAddr("admin");
    address solver = makeAddr("solver");
    address treasury = makeAddr("treasury");
    address supplier = makeAddr("supplier");
    address payee = makeAddr("payee");
    uint256 ownerKey = 0xA11CE;
    address owner = vm.addr(ownerKey);

    uint256 constant BUY = 138_300e6;
    uint256 constant MAX = 103e6;
    uint256 constant COST = 100e6;

    function setUp() public {
        vm.warp(1_000_000);
        usdt = new MockToken("USDT");
        cngn = new MockToken("cNGN");
        meet = _deploy(address(usdt), address(cngn), solver, 10);
        usdt.mint(owner, 1_000e6);
        cngn.mint(supplier, 1_000_000e6);
        vm.prank(owner);
        usdt.approve(address(meet), type(uint256).max);
        vm.prank(supplier);
        cngn.approve(address(meet), type(uint256).max);
    }

    function _deploy(address sell, address buy, address solver_, uint16 fee) internal returns (MeetSettlement) {
        return new MeetSettlement(sell, buy, admin, solver_, treasury, fee);
    }

    function _ob() internal view returns (MeetSettlement.Obligation memory) {
        return MeetSettlement.Obligation(
            owner, payee, address(usdt), address(cngn), BUY, MAX, 0, uint64(block.timestamp + 300), 1
        );
    }

    function _sign(MeetSettlement target, uint256 key, MeetSettlement.Obligation memory o)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, target.hashObligation(o));
        return abi.encodePacked(r, s, v);
    }

    function _settle(MeetSettlement.Obligation memory o, bytes memory sig, uint256 amount) internal {
        vm.prank(solver);
        meet.settle(o, sig, amount, supplier);
    }

    function _expectFail(MeetSettlement.Obligation memory o, bytes memory sig, uint256 amount, bytes4 err) internal {
        vm.prank(solver);
        vm.expectRevert(err);
        meet.settle(o, sig, amount, supplier);
    }

    // ---------- happy paths ----------

    function test_happyPath_recipientNotOwner() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.expectEmit(true, true, false, true);
        emit MeetSettlement.Paid(owner, payee, 1, COST, BUY);
        _settle(o, sig, COST);

        assertEq(cngn.balanceOf(payee), BUY);
        assertEq(usdt.balanceOf(owner), 1_000e6 - COST);
        assertEq(usdt.balanceOf(supplier), COST - COST / 1000);
        assertEq(usdt.balanceOf(treasury), COST / 1000);
        assertEq(usdt.balanceOf(address(meet)), 0);
        assertEq(cngn.balanceOf(address(meet)), 0);
        assertTrue(meet.used(owner, 1));
    }

    function test_happyPath_recipientIsOwner() public {
        MeetSettlement.Obligation memory o = _ob();
        o.recipient = owner;
        _settle(o, _sign(meet, ownerKey, o), COST);
        assertEq(cngn.balanceOf(owner), BUY);
    }

    function test_atExactMax_ownerPaysExactlyMax() public {
        MeetSettlement.Obligation memory o = _ob();
        _settle(o, _sign(meet, ownerKey, o), MAX);
        assertEq(1_000e6 - usdt.balanceOf(owner), MAX);
    }

    function test_atValidAfterExactly() public {
        MeetSettlement.Obligation memory o = _ob();
        o.validAfter = uint64(block.timestamp);
        _settle(o, _sign(meet, ownerKey, o), COST);
    }

    /// Digest and signature produced by viem in agent/test/eip712.test.ts.
    function test_viemSignatureMatches() public {
        address sell = address(0xa01);
        address buy = address(0xa02);
        address at = address(0xab370);
        deployCodeTo("Mocks.sol:MockToken", abi.encode("USDT"), sell);
        deployCodeTo("Mocks.sol:MockToken", abi.encode("cNGN"), buy);
        deployCodeTo(
            "MeetSettlement.sol:MeetSettlement", abi.encode(sell, buy, admin, address(this), treasury, uint16(10)), at
        );
        MeetSettlement m = MeetSettlement(at);
        address viemOwner = 0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7;
        MeetSettlement.Obligation memory o = MeetSettlement.Obligation(
            viemOwner, address(0xb0b), sell, buy, 138300000000, 103000000, 1000, 2000, 7
        );
        assertEq(block.chainid, 31337);
        assertEq(m.hashObligation(o), 0x269460d5ad12798b2e09292ebe388ac6cc105f15f2034157c0ea1573875ff7e9);

        MockToken(sell).mint(viemOwner, MAX);
        MockToken(buy).mint(supplier, BUY);
        vm.prank(viemOwner);
        MockToken(sell).approve(at, MAX);
        vm.prank(supplier);
        MockToken(buy).approve(at, BUY);
        vm.warp(1500);
        m.settle(
            o,
            hex"90677fc0a96c36f846484fdd821b70b7fb0b345e11f706a7651368492a1793cb448846b94b89864000a67740001cc769c2ffca5acbc302d342e806a55b2c6aa71b",
            COST,
            supplier
        );
        assertEq(MockToken(buy).balanceOf(address(0xb0b)), 138300000000);
    }

    // ---------- rejections ----------

    function test_revert_badSignature() public {
        _expectFail(_ob(), hex"1234", COST, MeetSettlement.BadSignature.selector);
    }

    function test_revert_wrongSigner() public {
        MeetSettlement.Obligation memory o = _ob();
        _expectFail(o, _sign(meet, 0xB0B, o), COST, MeetSettlement.BadSignature.selector);
    }

    function test_revert_changedRecipient() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        o.recipient = makeAddr("attacker");
        _expectFail(o, sig, COST, MeetSettlement.BadSignature.selector);
    }

    function test_revert_raisedMax() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        o.maxSellAmount = MAX + 1;
        _expectFail(o, sig, MAX + 1, MeetSettlement.BadSignature.selector);
    }

    function test_revert_beforeValidAfter() public {
        MeetSettlement.Obligation memory o = _ob();
        o.validAfter = uint64(block.timestamp + 1);
        _expectFail(o, _sign(meet, ownerKey, o), COST, MeetSettlement.NotYetValid.selector);
    }

    function test_revert_atExpiry() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.warp(o.expiry);
        _expectFail(o, sig, COST, MeetSettlement.Expired.selector);
    }

    function test_revert_afterExpiry() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.warp(uint256(o.expiry) + 1);
        _expectFail(o, sig, COST, MeetSettlement.Expired.selector);
    }

    function test_revert_cancelled() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.expectEmit(true, false, false, true);
        emit MeetSettlement.Cancelled(owner, 1);
        vm.prank(owner);
        meet.cancel(1);
        _expectFail(o, sig, COST, MeetSettlement.NonceCancelled.selector);
    }

    function test_cancelOnlyAffectsCaller() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.prank(payee);
        meet.cancel(1);
        _settle(o, sig, COST);
    }

    function test_cancelWorksWhilePaused() public {
        vm.prank(admin);
        meet.pause();
        vm.prank(owner);
        meet.cancel(9);
        assertTrue(meet.cancelled(owner, 9));
    }

    function test_revert_reusedNonce() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        _settle(o, sig, COST);
        _expectFail(o, sig, COST, MeetSettlement.NonceUsed.selector);

        // A different obligation with the same nonce is also blocked.
        MeetSettlement.Obligation memory other = _ob();
        other.buyAmount = BUY - 1;
        _expectFail(other, _sign(meet, ownerKey, other), COST, MeetSettlement.NonceUsed.selector);
    }

    function test_revert_aboveMaxByOneUnit() public {
        MeetSettlement.Obligation memory o = _ob();
        _expectFail(o, _sign(meet, ownerKey, o), MAX + 1, MeetSettlement.AboveMax.selector);
    }

    function test_feeCannotPushTotalAboveMax() public {
        MeetSettlement m = _deploy(address(usdt), address(cngn), solver, 30);
        vm.prank(owner);
        usdt.approve(address(m), type(uint256).max);
        vm.prank(supplier);
        cngn.approve(address(m), type(uint256).max);
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(m, ownerKey, o);
        vm.prank(solver);
        m.settle(o, sig, MAX, supplier);
        assertEq(1_000e6 - usdt.balanceOf(owner), MAX);
        assertEq(usdt.balanceOf(treasury), (MAX * 30) / 10_000);
    }

    function test_revert_nonAllowlistedToken() public {
        MockToken other = new MockToken("OTHER");
        MeetSettlement.Obligation memory o = _ob();
        o.sellToken = address(other);
        _expectFail(o, _sign(meet, ownerKey, o), COST, MeetSettlement.TokenNotAllowed.selector);
        o = _ob();
        o.buyToken = address(other);
        _expectFail(o, _sign(meet, ownerKey, o), COST, MeetSettlement.TokenNotAllowed.selector);
    }

    function test_revert_reversedTokens() public {
        MeetSettlement.Obligation memory o = _ob();
        (o.sellToken, o.buyToken) = (o.buyToken, o.sellToken);
        _expectFail(o, _sign(meet, ownerKey, o), COST, MeetSettlement.TokenNotAllowed.selector);
    }

    function test_revert_nonSolver() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.prank(owner);
        vm.expectRevert(MeetSettlement.NotSolver.selector);
        meet.settle(o, sig, COST, supplier);
    }

    function test_revert_paused_thenUnpause() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.prank(admin);
        meet.pause();
        _expectFail(o, sig, COST, Pausable.EnforcedPause.selector);
        vm.prank(admin);
        meet.unpause();
        _settle(o, sig, COST);
    }

    function test_revert_zeroAmounts() public {
        MeetSettlement.Obligation memory o = _ob();
        _expectFail(o, _sign(meet, ownerKey, o), 0, MeetSettlement.ZeroAmount.selector);
        o.buyAmount = 0;
        _expectFail(o, _sign(meet, ownerKey, o), COST, MeetSettlement.ZeroAmount.selector);
    }

    function test_revert_zeroRecipient() public {
        MeetSettlement.Obligation memory o = _ob();
        o.recipient = address(0);
        _expectFail(o, _sign(meet, ownerKey, o), COST, MeetSettlement.ZeroAddress.selector);
    }

    function test_revert_adminOnly() public {
        vm.startPrank(owner);
        vm.expectRevert();
        meet.pause();
        vm.expectRevert();
        meet.unpause();
        vm.expectRevert();
        meet.setSolver(owner);
        vm.stopPrank();
    }

    function test_setSolver() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        address next = makeAddr("next");
        vm.prank(admin);
        meet.setSolver(next);
        _expectFail(o, sig, COST, MeetSettlement.NotSolver.selector);
        vm.prank(next);
        meet.settle(o, sig, COST, supplier);
    }

    // Failure leaves nothing moved: recovery path in brief 3.4 step 8.
    function test_failureMovesNothing_supplierShort() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.prank(supplier);
        cngn.approve(address(meet), BUY - 1);
        vm.prank(solver);
        vm.expectRevert();
        meet.settle(o, sig, COST, supplier);
        assertEq(usdt.balanceOf(owner), 1_000e6);
        assertEq(cngn.balanceOf(payee), 0);
        assertFalse(meet.used(owner, 1));
    }

    function test_failureMovesNothing_ownerRevokedAllowance() public {
        MeetSettlement.Obligation memory o = _ob();
        bytes memory sig = _sign(meet, ownerKey, o);
        vm.prank(owner);
        usdt.approve(address(meet), 0);
        vm.prank(solver);
        vm.expectRevert();
        meet.settle(o, sig, COST, supplier);
        assertEq(cngn.balanceOf(supplier), 1_000_000e6);
        assertFalse(meet.used(owner, 1));
    }

    // ---------- fees and exactness ----------

    function test_revert_feeAboveCapAtDeploy() public {
        vm.expectRevert(MeetSettlement.FeeTooHigh.selector);
        _deploy(address(usdt), address(cngn), solver, 31);
    }

    function testFuzz_exactDeliveryAndFeeCap(uint96 amount, uint96 buy, uint16 bps) public {
        uint256 sellAmount = bound(amount, 1, 1_000e6);
        uint256 buyAmount = bound(buy, 1, 1_000_000e6);
        uint16 fee = uint16(bound(bps, 0, 30));
        MeetSettlement m = _deploy(address(usdt), address(cngn), solver, fee);
        vm.prank(owner);
        usdt.approve(address(m), type(uint256).max);
        vm.prank(supplier);
        cngn.approve(address(m), type(uint256).max);
        MeetSettlement.Obligation memory o = _ob();
        o.buyAmount = buyAmount;
        o.maxSellAmount = sellAmount;

        bytes memory sig = _sign(m, ownerKey, o);
        vm.prank(solver);
        m.settle(o, sig, sellAmount, supplier);

        assertEq(cngn.balanceOf(payee), buyAmount);
        assertEq(1_000e6 - usdt.balanceOf(owner), sellAmount);
        assertLe(usdt.balanceOf(treasury) * 10_000, sellAmount * 30);
        assertEq(usdt.balanceOf(treasury) + usdt.balanceOf(supplier), sellAmount);
    }

    // ---------- hostile tokens ----------

    function test_revert_tokenReturningFalse() public {
        FalseToken bad = new FalseToken();
        MeetSettlement m = _deploy(address(bad), address(cngn), solver, 10);
        bad.mint(owner, 1e12);
        vm.prank(owner);
        bad.approve(address(m), type(uint256).max);
        bad.setFail(true);
        MeetSettlement.Obligation memory o = _ob();
        o.sellToken = address(bad);
        bytes memory sig = _sign(m, ownerKey, o);
        vm.prank(solver);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(bad)));
        m.settle(o, sig, COST, supplier);
        assertFalse(m.used(owner, 1));
    }

    function test_revert_reentrancy() public {
        ReentrantToken evil = new ReentrantToken();
        MeetSettlement m = new MeetSettlement(address(evil), address(cngn), admin, address(evil), treasury, 10);
        evil.setTarget(m);
        evil.mint(owner, 1e12);
        vm.prank(owner);
        evil.approve(address(m), type(uint256).max);
        vm.prank(supplier);
        cngn.approve(address(m), type(uint256).max);
        MeetSettlement.Obligation memory o = _ob();
        o.sellToken = address(evil);
        bytes memory sig = _sign(m, ownerKey, o);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        evil.run(o, sig, COST, supplier);
    }
}
