// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Library for managing domain rewards
 */
library DomainHolderRewards {
    /**
 * @dev Storage structure for reward details
     * @param addressToReward Mapping of domain holder addresses to their respective rewards
     * @param totalRewardsAmount Total amount of rewards in the contract
     */
    struct RewardsStorage {
        /**
        * @notice A mapping that links a domain holder address to their reward amount.
        */
        mapping(address holderAddress => uint256 holderRewardAmount) addressToReward;

        /**
        * @notice Total amount of rewards accumulated in the contract.
        */
        uint256 totalRewardsAmount;
    }

    /**
     * @dev Function to get the total amount of rewards
     * @param _rewardsStorage The RewardsStorage struct instance
     * @return The total amount of domain rewards
     */
    function getTotalRewardAmount(RewardsStorage storage _rewardsStorage)
        internal
        view
        returns (uint256)
    {
        return _rewardsStorage.totalRewardsAmount;
    }

    /**
    * @dev Function to get the reward amount for a specific address
     * @param _rewardsStorage The RewardsStorage struct instance
     * @param _holderAddress The address of the domain holder
     * @return The amount of reward for the provided address
     */
    function getAddressRewardAmount(RewardsStorage storage _rewardsStorage, address _holderAddress)
        internal
        view
        returns (uint256)
    {
        return _rewardsStorage.addressToReward[_holderAddress];
    }

    /**
     * @dev Function to update the reward amount for a specific address
     * @param _rewardsStorage The storage instance
     * @param _holderAddress The address of the domain holder
     * @param _domainHolderReward The new reward amount for the holder
     */
    function applyRewardForAddress(
        RewardsStorage storage _rewardsStorage,
        address _holderAddress,
        uint256 _domainHolderReward
    )
    internal
    {
        _rewardsStorage.addressToReward[_holderAddress] += _domainHolderReward;
        _rewardsStorage.totalRewardsAmount += _domainHolderReward;
    }

    /**
     * @dev Function to reset the reward for a specific address
     * @param _rewardsStorage The RewardsStorage struct instance
     * @param _holderAddress The address of the domain holder
     */
    function resetRewardForAddress(
        RewardsStorage storage _rewardsStorage,
        address _holderAddress
    )
    internal
    {
        _rewardsStorage.totalRewardsAmount -= _rewardsStorage.addressToReward[_holderAddress];
        _rewardsStorage.addressToReward[_holderAddress] = 0;
    }
}
