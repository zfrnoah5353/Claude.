-- Petite boîte à outils d'interface : boutons « cartoon », textes avec contour,
-- vignettes 3D. Toutes les tailles sont pensées pour un écran de 1280x720 ;
-- un UIScale adapte le tout aux autres écrans.

local UI = {}

UI.INK = Color3.fromHex("3B2A5A")
UI.CREAM = Color3.fromHex("FFF6E6")
UI.WHITE = Color3.new(1, 1, 1)
UI.YELLOW = Color3.fromHex("FFD54A")
UI.PINK = Color3.fromHex("FF8FB8")
UI.GREEN = Color3.fromHex("3DD68C")
UI.MINT = Color3.fromHex("7EE0B8")
UI.LILAC = Color3.fromHex("B69CFF")
UI.SKY = Color3.fromHex("7FD6FF")
UI.ORANGE = Color3.fromHex("FF9A3C")
UI.RED = Color3.fromHex("FF5A6E")
UI.GRAY = Color3.fromHex("E4E0F2")
UI.MUTED = Color3.fromHex("8E8AA8")
UI.PURPLE = Color3.fromHex("8C7BFF")
UI.FONT = Enum.Font.FredokaOne

-- sons joués par les boutons (définis par le script principal)
UI.onClick = nil :: (() -> ())?
UI.onError = nil :: (() -> ())?

function UI.darken(c: Color3, t: number): Color3
	return c:Lerp(Color3.fromHex("1B1030"), t)
end

function UI.lighten(c: Color3, t: number): Color3
	return c:Lerp(Color3.new(1, 1, 1), t)
end

function UI.new(class: string, props: { [string]: any }?, children: { Instance }?): any
	local inst = Instance.new(class)
	local parent = nil
	if props then
		for k, v in props do
			if k == "Parent" then
				parent = v
			else
				(inst :: any)[k] = v
			end
		end
	end
	if children then
		for _, c in children do
			c.Parent = inst
		end
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

function UI.corner(inst: Instance, r: number?): UICorner
	return UI.new("UICorner", { CornerRadius = UDim.new(0, r or 16), Parent = inst })
end

function UI.stroke(inst: Instance, thickness: number?, color: Color3?): UIStroke
	return UI.new("UIStroke", {
		Thickness = thickness or 3,
		Color = color or UI.INK,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		Parent = inst,
	})
end

-- Cadre arrondi avec contour et ombre portée.
-- L'ombre est une « sœur » placée derrière : en mode Sibling, un enfant
-- s'affiche toujours au-dessus de son parent. On positionne donc le support
-- (frame.Parent) et on remplit le cadre renvoyé.
function UI.box(parent: Instance, props: { [string]: any }): Frame
	local holder = UI.new("Frame", {
		Name = props.Name or "Box",
		BackgroundTransparency = 1,
		Size = props.Size,
		Position = props.Position or UDim2.new(),
		AnchorPoint = props.AnchorPoint or Vector2.zero,
		ZIndex = props.ZIndex or 1,
		Parent = parent,
	})
	if props.Shadow ~= false then
		local sh = UI.new("Frame", {
			Name = "Shadow",
			BackgroundColor3 = UI.INK,
			BackgroundTransparency = 0.6,
			Size = UDim2.new(1, 4, 1, 4),
			Position = UDim2.new(0, -2, 0, 3),
			ZIndex = 1,
			Parent = holder,
		})
		UI.corner(sh, (props.Radius or 18) + 2)
	end
	local f = UI.new("Frame", {
		Name = "Body",
		BackgroundColor3 = props.Color or UI.CREAM,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 2,
		Parent = holder,
	})
	UI.corner(f, props.Radius or 18)
	UI.stroke(f, props.Stroke or 3.5)
	return f
end

-- Texte gras avec contour (style titres Roblox)
function UI.text(parent: Instance, props: { [string]: any }): TextLabel
	local t = UI.new("TextLabel", {
		BackgroundTransparency = 1,
		Font = UI.FONT,
		Text = props.Text or "",
		TextSize = props.TextSize or 20,
		TextColor3 = props.Color or UI.INK,
		TextXAlignment = props.AlignX or Enum.TextXAlignment.Center,
		TextYAlignment = props.AlignY or Enum.TextYAlignment.Center,
		TextWrapped = props.Wrap or false,
		Size = props.Size or UDim2.fromScale(1, 1),
		Position = props.Position or UDim2.new(),
		AnchorPoint = props.AnchorPoint or Vector2.zero,
		ZIndex = props.ZIndex or 2,
		RichText = props.Rich or false,
		Name = props.Name or "Text",
		Parent = parent,
	})
	if props.Outline then
		UI.new("UIStroke", {
			Thickness = props.Outline,
			Color = UI.INK,
			ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
			Parent = t,
		})
	end
	return t
end

-- Bouton coloré avec ombre, survol et clic animés.
-- Renvoie { holder, frame, label, set(self, texte?, actif?) }.
function UI.button(parent: Instance, props: { [string]: any }, onClick: (() -> ())?): any
	local color: Color3 = props.Color or UI.GREEN
	local holder = UI.new("Frame", {
		Name = props.Name or "Button",
		BackgroundTransparency = 1,
		Size = props.Size,
		Position = props.Position or UDim2.new(),
		AnchorPoint = props.AnchorPoint or Vector2.zero,
		ZIndex = props.ZIndex or 1,
		Parent = parent,
	})
	local sh = UI.new("Frame", {
		Name = "Shadow",
		BackgroundColor3 = UI.darken(color, 0.3),
		Size = UDim2.new(1, 4, 1, 4),
		Position = UDim2.new(0, -2, 0, 4),
		ZIndex = 1,
		Parent = holder,
	})
	UI.corner(sh, (props.Radius or 16) + 2)
	local b = UI.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		BackgroundColor3 = color,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 2,
		Parent = holder,
	})
	UI.corner(b, props.Radius or 16)
	UI.stroke(b, 3.5)
	local lbl = UI.text(b, {
		Text = props.Text or "",
		TextSize = props.TextSize or 20,
		Color = UI.WHITE,
		Outline = 2.5,
		Size = UDim2.new(1, -10, 1, 0),
		Position = UDim2.fromOffset(5, 0),
	})
	local lblStroke = lbl:FindFirstChildOfClass("UIStroke")
	local obj = { holder = holder, frame = b, label = lbl, enabled = props.Enabled ~= false }
	local function paint(hover: boolean)
		if obj.enabled then
			b.BackgroundColor3 = if hover then UI.lighten(color, 0.15) else color
			sh.BackgroundColor3 = UI.darken(color, 0.3)
			lbl.TextColor3 = UI.WHITE
		else
			b.BackgroundColor3 = UI.GRAY
			sh.BackgroundColor3 = Color3.fromHex("B3AED0")
			lbl.TextColor3 = Color3.fromHex("6E6890")
		end
		if lblStroke then
			lblStroke.Enabled = obj.enabled
		end
	end
	function obj.set(_, text: string?, en: boolean?)
		if text then
			lbl.Text = text
		end
		if en ~= nil then
			obj.enabled = en
		end
		paint(false)
	end
	function obj.recolor(_, c: Color3)
		color = c
		paint(false)
	end
	paint(false)
	b.MouseEnter:Connect(function()
		paint(true)
	end)
	b.MouseLeave:Connect(function()
		paint(false)
	end)
	b.Activated:Connect(function()
		if not obj.enabled then
			if UI.onError then
				UI.onError()
			end
			return
		end
		b.Position = UDim2.fromOffset(0, 3)
		task.delay(0.09, function()
			b.Position = UDim2.new()
		end)
		if UI.onClick then
			UI.onClick()
		end
		if onClick then
			onClick()
		end
	end)
	return obj
end

-- Barre de progression arrondie
function UI.bar(parent: Instance, props: { [string]: any }): (Frame, (number) -> ())
	local back = UI.new("Frame", {
		BackgroundColor3 = UI.WHITE,
		Size = props.Size,
		Position = props.Position or UDim2.new(),
		ZIndex = props.ZIndex or 2,
		Parent = parent,
	})
	UI.corner(back, 100)
	UI.stroke(back, 2.5)
	local fill = UI.new("Frame", {
		BackgroundColor3 = props.Color or UI.YELLOW,
		Size = UDim2.fromScale(0, 1),
		ZIndex = (props.ZIndex or 2) + 1,
		Parent = back,
	})
	UI.corner(fill, 100)
	local function set(f: number)
		f = math.clamp(f, 0, 1)
		fill.Visible = f > 0.01
		fill.Size = UDim2.fromScale(f, 1)
	end
	set(props.Value or 0)
	return back, set
end

-- Vignette 3D : un modèle dans un ViewportFrame, cadré automatiquement
function UI.viewport(parent: Instance, model: Model, props: { [string]: any }): ViewportFrame
	local vp = UI.new("ViewportFrame", {
		BackgroundTransparency = 1,
		Size = props.Size or UDim2.fromScale(1, 1),
		Position = props.Position or UDim2.new(),
		AnchorPoint = props.AnchorPoint or Vector2.zero,
		ZIndex = props.ZIndex or 3,
		Ambient = Color3.fromRGB(200, 200, 210),
		LightColor = Color3.new(1, 1, 1),
		LightDirection = Vector3.new(-0.4, -1, -0.6),
		Parent = parent,
	})
	model:PivotTo(CFrame.Angles(0, math.rad(props.Yaw or 20), 0))
	model.Parent = vp
	local cam = UI.new("Camera", { FieldOfView = 30, Parent = vp })
	local box, size = model:GetBoundingBox()
	local center = box.Position
	local radius = math.max(size.X, size.Y, size.Z) * 0.62
	local dist = radius / math.tan(math.rad(15)) * (props.Zoom or 1)
	cam.CFrame = CFrame.lookAt(center + Vector3.new(0, dist * 0.18, -dist), center)
	vp.CurrentCamera = cam
	return vp
end

return UI
