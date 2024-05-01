// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDCToken is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {
        _mint(msg.sender, 10000000000000000000000);
    }
}
