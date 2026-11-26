return function()
	local ProfileSchema = require(script.Parent.ProfileSchema)

	describe("default", function()
		it("returns a fresh table every call", function()
			local a = ProfileSchema.default()
			local b = ProfileSchema.default()
			a.inventory.kaito = 3
			expect(b.inventory.kaito).to.equal(nil)
		end)
	end)

	describe("load", function()
		it("gives new players the default profile", function()
			local profile = ProfileSchema.load(nil)
			expect(profile.version).to.equal(ProfileSchema.CURRENT_VERSION)
			expect(profile.coins).to.equal(0)
		end)

		it("keeps valid data", function()
			local profile = ProfileSchema.load({
				version = 1,
				coins = 500,
				totalRolls = 42,
				pity = 7,
				bestOneIn = 800,
				inventory = { kaito = 3, ayame = 1 },
				equipped = { "ayame" },
				discovered = { kaito = true, ayame = true },
				upgrades = { luck = 2, speed = 1, income = 0 },
			})
			expect(profile.coins).to.equal(500)
			expect(profile.inventory.ayame).to.equal(1)
			expect(profile.equipped[1]).to.equal("ayame")
			expect(profile.upgrades.luck).to.equal(2)
		end)

		it("repairs corrupt fields without losing the rest", function()
			local profile = ProfileSchema.load({
				version = 1,
				coins = 0 / 0,
				totalRolls = -5,
				inventory = { kaito = 2, bad = "x", zero = 0 },
				equipped = { "kaito", "kaito", "notOwned", 12 },
				upgrades = "nope",
			})
			expect(profile.coins).to.equal(0)
			expect(profile.totalRolls).to.equal(0)
			expect(profile.inventory.kaito).to.equal(2)
			expect(profile.inventory.bad).to.equal(nil)
			expect(profile.inventory.zero).to.equal(nil)
			expect(#profile.equipped).to.equal(1)
			expect(profile.upgrades.luck).to.equal(0)
		end)

		it("refuses data written by a newer server", function()
			expect(function()
				ProfileSchema.load({ version = ProfileSchema.CURRENT_VERSION + 1 })
			end).to.throw()
		end)
	end)
end
