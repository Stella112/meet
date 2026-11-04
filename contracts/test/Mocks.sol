// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MeetSettlement} from "../src/MeetSettlement.sol";

contract MockToken is ERC20 {
    constructor(string memory symbol_) ERC20(symbol_, symbol_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Returns false instead of reverting when told to fail.
contract FalseToken is MockToken("FALSE") {
    bool public fail;

    function setFail(bool fail_) external {
        fail = fail_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        return super.transferFrom(from, to, amount);
    }
}

/// Acts as solver and re-enters settle from inside transferFrom.
contract ReentrantToken is MockToken("REENTER") {
    MeetSettlement public target;
    MeetSettlement.Obligation private o;
    bytes private sig;
    uint256 private amount_;
    address private supplier;
    bool private armed;

    function setTarget(MeetSettlement target_) external {
        target = target_;
    }

    function run(MeetSettlement.Obligation calldata o_, bytes calldata sig_, uint256 a, address s) external {
        o = o_;
        sig = sig_;
        amount_ = a;
        supplier = s;
        armed = true;
        target.settle(o_, sig_, a, s);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (armed) {
            armed = false;
            target.settle(o, sig, amount_, supplier);
        }
        return super.transferFrom(from, to, amount);
    }
}
