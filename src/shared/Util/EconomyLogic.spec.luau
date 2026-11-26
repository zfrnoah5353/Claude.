return function()
	local EconomyLogic = require(script.Parent.EconomyLogic)
	local Config = require(script.Parent.Parent.Config)

	describe("upgradeCost", function()
		it("starts at the base cost and strictly increases", function()
			for _, id in Config.UPGRADE_ORDER do
				local def = Config.UPGRADES[id]
				expect(EconomyLogic.upgradeCost(id, 0)).to.equal(def.baseCost)
				for level = 1, def.maxLevel do
					expect(
						EconomyLogic.upgradeCost(id, level)
							> EconomyLogic.upgradeCost(id, level - 1)
					).to.equal(true)
				end
			end
		end)
	end)

	describe("rollCooldown", function()
		it("never goes below the minimum", function()
			for level = 0, 100 do
				expect(EconomyLogic.rollCooldown(level) >= Config.MIN_ROLL_COOLDOWN).to.equal(true)
			end
			expect(EconomyLogic.rollCooldown(0)).to.equal(Config.BASE_ROLL_COOLDOWN)
		end)
	end)

	describe("incomePerSecond", function()
		it("sums equipped power with the income multiplier", function()
			local defs = {
				{
					id = "a",
					displayName = "",
					title = "",
					rarity = "Common",
					oneIn = 2,
					power = 10,
				},
				{
					id = "b",
					displayName = "",
					title = "",
					rarity = "Common",
					oneIn = 2,
					power = 30,
				},
			}
			expect(EconomyLogic.incomePerSecond(defs, 0)).to.equal(40)
			expect(EconomyLogic.incomePerSecond(defs, 4)).to.equal(80)
			expect(EconomyLogic.incomePerSecond({}, 10)).to.equal(0)
		end)
	end)
end
