--!strict
-- Modal panels (inventory, index, shop, QA). One open at a time, animated
-- open/close, responsive grid helper.

local Ui = require(script.Parent.Ui)

export type Panel = {
	name: string,
	frame: Frame,
	toolbar: Frame,
	content: ScrollingFrame,
	onOpen: (() -> ())?,
}

local Panels = {}

local registry: { [string]: Panel } = {}
local openName: string? = nil

local function setVisible(panel: Panel, visible: boolean)
	local scale = Ui.scaleOf(panel.frame)
	if visible then
		panel.frame.Visible = true
		scale.Scale = 0.6
		Ui.tween(scale, Ui.BOUNCY, { Scale = 1 })
		if panel.onOpen then
			panel.onOpen()
		end
	else
		local tween = Ui.tween(scale, Ui.FAST, { Scale = 0.6 })
		tween.Completed:Once(function(state)
			if state == Enum.PlaybackState.Completed then
				panel.frame.Visible = false
			end
		end)
	end
end

function Panels.close()
	local current = openName
	if current then
		openName = nil
		setVisible(registry[current], false)
	end
end

function Panels.toggle(name: string)
	local wasOpen = openName == name
	Panels.close()
	if not wasOpen then
		local panel = registry[name]
		if panel then
			openName = name
			setVisible(panel, true)
			Ui.sound(Ui.SOUND_WHOOSH, 0.3)
		end
	end
end

function Panels.isOpen(name: string): boolean
	return openName == name
end

function Panels.create(name: string, titleText: string, accent: Color3): Panel
	local frame: Frame = Ui.make("Frame", {
		Name = name .. "Panel",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.47),
		Size = UDim2.fromScale(0.66, 0.72),
		BackgroundColor3 = Ui.Theme.panel,
		Visible = false,
		ZIndex = 10,
		Parent = Ui.root(),
	})
	Ui.corner(frame, 0.04)
	Ui.stroke(frame, accent, 3)
	Ui.make("UISizeConstraint", { MaxSize = Vector2.new(1100, 760), Parent = frame })

	Ui.label({
		Name = "Title",
		Text = titleText,
		Font = Ui.FONT_TITLE,
		TextColor3 = accent,
		Position = UDim2.fromScale(0.03, 0.02),
		Size = UDim2.fromScale(0.7, 0.09),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 40,
		ZIndex = 11,
		Parent = frame,
	})

	local close = Ui.button({
		Name = "Close",
		Text = "X",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(0.98, 0.02),
		Size = UDim2.fromScale(0.07, 0.09),
		ZIndex = 11,
		Parent = frame,
	}, Ui.Theme.bad)
	Ui.aspect(close, 1)
	close.Activated:Connect(Panels.close)

	local toolbar: Frame = Ui.make("Frame", {
		Name = "Toolbar",
		BackgroundTransparency = 1,
		Position = UDim2.fromScale(0.03, 0.12),
		Size = UDim2.fromScale(0.94, 0.08),
		ZIndex = 11,
		Parent = frame,
	})

	local content: ScrollingFrame = Ui.make("ScrollingFrame", {
		Name = "Content",
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		Position = UDim2.fromScale(0.03, 0.22),
		Size = UDim2.fromScale(0.94, 0.75),
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 6,
		ScrollBarImageColor3 = accent,
		ZIndex = 11,
		Parent = frame,
	})

	local panel: Panel =
		{ name = name, frame = frame, toolbar = toolbar, content = content, onOpen = nil }
	registry[name] = panel
	return panel
end

-- Responsive grid: square-ish cells sized from the container's real width.
function Panels.grid(content: ScrollingFrame, aspect: number)
	local layout: UIGridLayout = Ui.make("UIGridLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		CellPadding = UDim2.fromOffset(8, 8),
		Parent = content,
	})
	local function resize()
		local width = content.AbsoluteSize.X - content.ScrollBarThickness - 4
		local columns = if width < 420 then 2 elseif width < 700 then 3 else 4
		local cell = (width - 8 * (columns - 1)) / columns
		layout.CellSize = UDim2.fromOffset(math.floor(cell), math.floor(cell * aspect))
	end
	content:GetPropertyChangedSignal("AbsoluteSize"):Connect(resize)
	resize()
end

return table.freeze(Panels)
