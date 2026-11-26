--!strict
-- Cleanup list: every object that makes connections owns one, cleaned once.

export type Task = RBXScriptConnection | Instance | () -> () | { Disconnect: (any) -> () }

export type Maid = {
	add: (self: Maid, task: Task) -> (),
	clean: (self: Maid) -> (),
}

local Maid = {}

function Maid.new(): Maid
	local tasks: { Task } = {}
	local self = {}

	function self.add(_: any, t: Task)
		table.insert(tasks, t)
	end

	function self.clean(_: any)
		local current = tasks
		tasks = {}
		for _, t in current do
			if typeof(t) == "Instance" then
				t:Destroy()
			elseif typeof(t) == "function" then
				t()
			else
				-- RBXScriptConnection or a Signal connection: both Disconnect().
				(t :: any):Disconnect()
			end
		end
	end

	return self :: any
end

return table.freeze(Maid)
