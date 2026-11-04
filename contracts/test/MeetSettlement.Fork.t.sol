// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MeetSettlement} from "../src/MeetSettlement.sol";

/// Run with: forge test --match-contract Fork --fork-url https://forno.celo.org
contract MeetSettlementForkTest is Test {
    // Verified on-chain, see docs/VERIFIED.md
    address constant CNGN = 0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f;
    address constant USDT = 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e;
    address constant POOL = 0x6519d56Eb0A69FC0338657784c783B169b8f7d32;

    MeetSettlement meet;
    address solver = makeAddr("solver");
    address treasury = makeAddr("treasury");
    address supplier = makeAddr("supplier");
    address payee = makeAddr("payee");
    uint256 ownerKey = 0xA11CE;
    address owner = vm.addr(ownerKey);

    function setUp() public {
        require(block.chainid == 42220, "needs Celo mainnet fork");
        meet = new MeetSettlement(USDT, CNGN, address(this), solver, treasury, 10);
        // Funds come from the pool by impersonation, on the local fork only.
        vm.startPrank(POOL);
        IERC20Metadata(USDT).transfer(owner, 100e6);
        IERC20Metadata(CNGN).transfer(supplier, 140_000e6);
        vm.stopPrank();
        vm.prank(owner);
        IERC20Metadata(USDT).approve(address(meet), 100e6);
        vm.prank(supplier);
        IERC20Metadata(CNGN).approve(address(meet), 140_000e6);
    }

    function _ob(uint256 max) internal view returns (MeetSettlement.Obligation memory) {
        return MeetSettlement.Obligation(owner, payee, USDT, CNGN, 138_000e6, max, 0, uint64(block.timestamp + 300), 1);
    }

    function _sign(MeetSettlement.Obligation memory o) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, meet.hashObligation(o));
        return abi.encodePacked(r, s, v);
    }

    function test_decimals() public view {
        assertEq(IERC20Metadata(CNGN).decimals(), 6);
        assertEq(IERC20Metadata(USDT).decimals(), 6);
    }

    function test_payWithRealTokens() public {
        MeetSettlement.Obligation memory o = _ob(100e6);
        bytes memory sig = _sign(o);
        vm.prank(solver);
        meet.settle(o, sig, 100e6, supplier);

        assertEq(IERC20Metadata(CNGN).balanceOf(payee), 138_000e6);
        assertEq(IERC20Metadata(USDT).balanceOf(owner), 0);
        assertEq(IERC20Metadata(USDT).balanceOf(supplier), 99_900_000);
        assertEq(IERC20Metadata(USDT).balanceOf(treasury), 100_000);
        assertEq(IERC20Metadata(USDT).balanceOf(address(meet)), 0);
        assertEq(IERC20Metadata(CNGN).balanceOf(address(meet)), 0);
    }

    function test_revert_oneUnitAboveMax() public {
        MeetSettlement.Obligation memory o = _ob(99e6);
        bytes memory sig = _sign(o);
        vm.prank(solver);
        vm.expectRevert(MeetSettlement.AboveMax.selector);
        meet.settle(o, sig, 99e6 + 1, supplier);
    }
}
