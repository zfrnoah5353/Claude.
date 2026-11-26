--!strict
-- Minimal typed signal for cross-module events (no _G, no BindableEvents).

export type Connection = { Disconnect: (self: Connection) -> () }

export type Signal<T...> = {
	Connect: (self: Signal<T...>, fn: (T...) -> ()) -> Connection,
	Fire: (self: Signal<T...>, T...) -> (),
}

local Signal = {}

function Signal.new<T...>(): Signal<T...>
	local handlers: { [number]: (T...) -> () } = {}
	local nextId = 0

	local self = {}

	function self.Connect(_: any, fn: (T...) -> ()): Connection
		nextId += 1
		local id = nextId
		handlers[id] = fn
		local connection = {}
		function connection.Disconnect(_: any)
			handlers[id] = nil
		end
		return connection :: any
	end

	function self.Fire(_: any, ...: T...)
		for _, fn in table.clone(handlers) do
			task.spawn(fn, ...)
		end
	end

	return self :: any
end

return table.freeze(Signal)
