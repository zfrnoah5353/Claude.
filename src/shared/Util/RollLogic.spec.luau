return function()
	local RollLogic = require(script.Parent.RollLogic)

	local function seeded(seed: number): () -> number
		local random = Random.new(seed)
		return function()
			return random:NextNumber()
		end
	end

	local POOL = {
		{ id = "rare", displayName = "R", title = "", rarity = "Rare", oneIn = 1000, power = 10 },
		{ id = "mid", displayName = "M", title = "", rarity = "Uncommon", oneIn = 10, power = 2 },
		{ id = "common", displayName = "C", title = "", rarity = "Common", oneIn = 2, power = 1 },
	}

	describe("chance", function()
		it("is luck / oneIn, clamped to 1", function()
			expect(RollLogic.chance(100, 1)).to.equal(0.01)
			expect(RollLogic.chance(100, 50)).to.equal(0.5)
			expect(RollLogic.chance(100, 500)).to.equal(1)
			expect(RollLogic.chance(1, 1)).to.equal(1)
		end)
	end)

	describe("roll", function()
		it("falls back to the most common entry when nothing hits", function()
			local def = RollLogic.roll(POOL, 1, function()
				return 0.999
			end)
			expect(def.id).to.equal("common")
		end)

		it("returns the rarest entry when everything hits", function()
			local def = RollLogic.roll(POOL, 1, function()
				return 0
			end)
			expect(def.id).to.equal("rare")
		end)

		it("respects the pity floor", function()
			for seed = 1, 200 do
				local def = RollLogic.roll(POOL, 1, seeded(seed), 1000)
				expect(def.id).to.equal("rare")
			end
		end)

		it("treats NaN / sub-1 luck as 1", function()
			local def = RollLogic.roll(POOL, 0 / 0, function()
				return 0.05 -- would hit "mid" (1/10) only with luck >= 1
			end)
			expect(def.id).to.equal("mid")
		end)

		it("matches the advertised odds statistically", function()
			local rng = seeded(42)
			local hits = 0
			local trials = 200000
			for _ = 1, trials do
				if RollLogic.roll(POOL, 1, rng).id == "mid" then
					hits += 1
				end
			end
			-- P(mid) = (1 - 1/1000) * 1/10 ~= 0.0999
			local rate = hits / trials
			expect(rate > 0.095 and rate < 0.105).to.equal(true)
		end)

		it("more luck never lowers the chance of the rarest entry", function()
			local previous = 0
			for _, luck in { 1, 2, 5, 10, 100, 1000 } do
				local chance = RollLogic.chance(1000, luck)
				expect(chance >= previous).to.equal(true)
				previous = chance
			end
		end)
	end)

	describe("luckFor", function()
		it("boosts every Nth roll", function()
			local luck, boosted = RollLogic.luckFor(1.5, 10, 10, 2, nil)
			expect(boosted).to.equal(true)
			expect(luck).to.equal(3)
			local luck2, boosted2 = RollLogic.luckFor(1.5, 11, 10, 2, nil)
			expect(boosted2).to.equal(false)
			expect(luck2).to.equal(1.5)
		end)

		it("applies the override multiplier", function()
			local luck = RollLogic.luckFor(1, 1, 10, 2, 100)
			expect(luck).to.equal(100)
		end)
	end)

	describe("isPityRoll", function()
		it("triggers exactly on the threshold roll", function()
			expect(RollLogic.isPityRoll(248, 250)).to.equal(false)
			expect(RollLogic.isPityRoll(249, 250)).to.equal(true)
		end)
	end)
end
