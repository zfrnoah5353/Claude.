package main

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"math"
	"strconv"
	"strings"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/text/v2"
	"github.com/hajimehoshi/ebiten/v2/vector"
)

// ---------- géométrie et couleurs ----------

type Rect struct{ X, Y, W, H float64 }

func (r Rect) In(x, y float64) bool { return x >= r.X && y >= r.Y && x < r.X+r.W && y < r.Y+r.H }
func (r Rect) CX() float64          { return r.X + r.W/2 }
func (r Rect) CY() float64          { return r.Y + r.H/2 }
func (r Rect) Inset(d float64) Rect {
	return Rect{r.X + d, r.Y + d, r.W - 2*d, r.H - 2*d}
}

var (
	ink     = hexc("#3B2A5A")
	white   = hexc("#FFFFFF")
	cream   = hexc("#FFF6E6")
	yellow  = hexc("#FFD54A")
	pink    = hexc("#FF8FB8")
	green   = hexc("#3DD68C")
	mint    = hexc("#7EE0B8")
	lilac   = hexc("#B69CFF")
	sky     = hexc("#7FD6FF")
	orange  = hexc("#FF9A3C")
	red     = hexc("#FF5A6E")
	grayBtn = hexc("#E4E0F2")
	muted   = hexc("#8E8AA8")
)

func hexc(s string) color.RGBA {
	s = strings.TrimPrefix(s, "#")
	v, _ := strconv.ParseUint(s, 16, 32)
	if len(s) == 8 {
		return alpha(color.RGBA{uint8(v >> 24), uint8(v >> 16), uint8(v >> 8), 255}, float64(uint8(v))/255)
	}
	return color.RGBA{uint8(v >> 16), uint8(v >> 8), uint8(v), 255}
}

// alpha renvoie une couleur prémultipliée avec l'opacité a.
func alpha(c color.RGBA, a float64) color.RGBA {
	a = clamp(a, 0, 1)
	return color.RGBA{uint8(float64(c.R) * a), uint8(float64(c.G) * a), uint8(float64(c.B) * a), uint8(float64(c.A) * a)}
}

func mix(a, b color.RGBA, t float64) color.RGBA {
	t = clamp(t, 0, 1)
	l := func(x, y uint8) uint8 { return uint8(float64(x) + (float64(y)-float64(x))*t) }
	return color.RGBA{l(a.R, b.R), l(a.G, b.G), l(a.B, b.B), l(a.A, b.A)}
}

func lighten(c color.RGBA, t float64) color.RGBA { return mix(c, white, t) }
func darken(c color.RGBA, t float64) color.RGBA {
	return mix(c, color.RGBA{0x1B, 0x10, 0x30, 255}, t)
}

func hsv(h, s, v float64) color.RGBA {
	h = math.Mod(h, 360)
	if h < 0 {
		h += 360
	}
	c := v * s
	x := c * (1 - math.Abs(math.Mod(h/60, 2)-1))
	m := v - c
	var r, g, b float64
	switch {
	case h < 60:
		r, g, b = c, x, 0
	case h < 120:
		r, g, b = x, c, 0
	case h < 180:
		r, g, b = 0, c, x
	case h < 240:
		r, g, b = 0, x, c
	case h < 300:
		r, g, b = x, 0, c
	default:
		r, g, b = c, 0, x
	}
	return color.RGBA{uint8((r + m) * 255), uint8((g + m) * 255), uint8((b + m) * 255), 255}
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }
func lerp(a, b, t float64) float64    { return a + (b-a)*t }
func dist(x0, y0, x1, y1 float64) float64 {
	return math.Hypot(x1-x0, y1-y0)
}
func rad(deg float64) float64 { return deg * math.Pi / 180 }

func fmtNum(v float64) string {
	if v < 0 {
		return "-" + fmtNum(-v)
	}
	if v < 1000 {
		return strconv.Itoa(int(math.Floor(v)))
	}
	suf := []string{"K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"}
	i := -1
	for v >= 1000 && i < len(suf)-1 {
		v /= 1000
		i++
	}
	var s string
	switch {
	case v < 10:
		s = fmt.Sprintf("%.2f", math.Floor(v*100)/100)
	case v < 100:
		s = fmt.Sprintf("%.1f", math.Floor(v*10)/10)
	default:
		s = fmt.Sprintf("%.0f", math.Floor(v))
	}
	if strings.Contains(s, ".") {
		s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	}
	return s + suf[i]
}

func fmtTime(sec float64) string {
	if sec < 0 {
		sec = 0
	}
	s := int(sec)
	if s >= 3600 {
		return fmt.Sprintf("%dh %02dm", s/3600, (s%3600)/60)
	}
	return fmt.Sprintf("%02d:%02d", s/60, s%60)
}

// ---------- formes vectorielles ----------

var (
	whiteImage    = ebiten.NewImage(3, 3)
	whiteSubImage *ebiten.Image
	vtxBuf        []ebiten.Vertex
	idxBuf        []uint16
)

func init() {
	whiteImage.Fill(color.White)
	whiteSubImage = whiteImage.SubImage(image.Rect(1, 1, 2, 2)).(*ebiten.Image)
}

func colorVerts(vs []ebiten.Vertex, c color.Color) {
	r, g, b, a := c.RGBA()
	fr, fg, fb, fa := float32(r)/0xffff, float32(g)/0xffff, float32(b)/0xffff, float32(a)/0xffff
	for i := range vs {
		vs[i].SrcX, vs[i].SrcY = 1.5, 1.5
		vs[i].ColorR, vs[i].ColorG, vs[i].ColorB, vs[i].ColorA = fr, fg, fb, fa
	}
}

// concaveFill force la règle « non nulle » pour le prochain remplissage :
// indispensable pour les formes concaves (étoiles, couronnes…), mais plus
// coûteux car il empêche le regroupement des appels de dessin.
var concaveFill bool

// S est l'échelle de rendu courante : l'écran logique fait toujours 1280x720,
// mais on dessine dans une image plus grande (suréchantillonnage) que l'on
// réduit ensuite, ce qui lisse les contours sans l'anticrénelage coûteux.
// Les sprites mis en cache sont dessinés à S = 1 avec anticrénelage.
var S = 1.0

var (
	pm       = ebiten.ColorScaleModePremultipliedAlpha
	optsAA   = &ebiten.DrawTrianglesOptions{AntiAlias: true, FillRule: ebiten.FillRuleFillAll, ColorScaleMode: pm}
	optsAANZ = &ebiten.DrawTrianglesOptions{AntiAlias: true, FillRule: ebiten.FillRuleNonZero, ColorScaleMode: pm}
	optsSS   = &ebiten.DrawTrianglesOptions{FillRule: ebiten.FillRuleFillAll, ColorScaleMode: pm}
	optsSSNZ = &ebiten.DrawTrianglesOptions{FillRule: ebiten.FillRuleNonZero, ColorScaleMode: pm}
)

func triOpts(nonZero bool) *ebiten.DrawTrianglesOptions {
	if S == 1 {
		if nonZero {
			return optsAANZ
		}
		return optsAA
	}
	if nonZero {
		return optsSSNZ
	}
	return optsSS
}

func opaque(c color.Color) bool {
	_, _, _, a := c.RGBA()
	return a == 0xffff
}

func scaleVerts() {
	if S == 1 {
		return
	}
	s := float32(S)
	for i := range vtxBuf {
		vtxBuf[i].DstX *= s
		vtxBuf[i].DstY *= s
	}
}

func fillPath(dst *ebiten.Image, p *vector.Path, c color.Color) {
	vtxBuf, idxBuf = p.AppendVerticesAndIndicesForFilling(vtxBuf[:0], idxBuf[:0])
	colorVerts(vtxBuf, c)
	scaleVerts()
	dst.DrawTriangles(vtxBuf, idxBuf, whiteSubImage, triOpts(concaveFill))
}

func strokePath(dst *ebiten.Image, p *vector.Path, w float64, c color.Color) {
	so := &vector.StrokeOptions{Width: float32(w), LineJoin: vector.LineJoinRound, LineCap: vector.LineCapRound}
	vtxBuf, idxBuf = p.AppendVerticesAndIndicesForStroke(vtxBuf[:0], idxBuf[:0], so)
	colorVerts(vtxBuf, c)
	scaleVerts()
	dst.DrawTriangles(vtxBuf, idxBuf, whiteSubImage, triOpts(!opaque(c)))
}

func shape(dst *ebiten.Image, p *vector.Path, fill color.Color, sw float64, sc color.Color) {
	if fill != nil {
		fillPath(dst, p, fill)
	}
	if sw > 0 {
		strokePath(dst, p, sw, sc)
	}
}

func pathRoundRect(x, y, w, h, r float64) *vector.Path {
	p := &vector.Path{}
	r = math.Min(r, math.Min(w/2, h/2))
	X, Y, W, H, R := float32(x), float32(y), float32(w), float32(h), float32(r)
	if R <= 0.5 {
		p.MoveTo(X, Y)
		p.LineTo(X+W, Y)
		p.LineTo(X+W, Y+H)
		p.LineTo(X, Y+H)
		p.Close()
		return p
	}
	p.MoveTo(X+R, Y)
	p.LineTo(X+W-R, Y)
	p.Arc(X+W-R, Y+R, R, -math.Pi/2, 0, vector.Clockwise)
	p.LineTo(X+W, Y+H-R)
	p.Arc(X+W-R, Y+H-R, R, 0, math.Pi/2, vector.Clockwise)
	p.LineTo(X+R, Y+H)
	p.Arc(X+R, Y+H-R, R, math.Pi/2, math.Pi, vector.Clockwise)
	p.LineTo(X, Y+R)
	p.Arc(X+R, Y+R, R, math.Pi, 3*math.Pi/2, vector.Clockwise)
	p.Close()
	return p
}

func pathEllipse(cx, cy, rx, ry, rot float64) *vector.Path {
	p := &vector.Path{}
	const n = 36
	cr, sr := math.Cos(rot), math.Sin(rot)
	for i := 0; i < n; i++ {
		a := float64(i) / n * 2 * math.Pi
		x, y := math.Cos(a)*rx, math.Sin(a)*ry
		X, Y := float32(cx+x*cr-y*sr), float32(cy+x*sr+y*cr)
		if i == 0 {
			p.MoveTo(X, Y)
		} else {
			p.LineTo(X, Y)
		}
	}
	p.Close()
	return p
}

func pathPoly(pts ...float64) *vector.Path {
	p := &vector.Path{}
	for i := 0; i+1 < len(pts); i += 2 {
		if i == 0 {
			p.MoveTo(float32(pts[i]), float32(pts[i+1]))
		} else {
			p.LineTo(float32(pts[i]), float32(pts[i+1]))
		}
	}
	p.Close()
	return p
}

func rrect(dst *ebiten.Image, x, y, w, h, r float64, fill color.Color, sw float64) {
	shape(dst, pathRoundRect(x, y, w, h, r), fill, sw, ink)
}

func rrectC(dst *ebiten.Image, x, y, w, h, r float64, fill color.Color, sw float64, sc color.Color) {
	shape(dst, pathRoundRect(x, y, w, h, r), fill, sw, sc)
}

// box : rectangle arrondi façon « bouton Roblox » avec ombre portée en dessous.
func box(dst *ebiten.Image, x, y, w, h, r float64, fill, shadow color.Color, sw float64) {
	if shadow != nil {
		rrect(dst, x-sw/2, y-sw/2+5, w+sw, h+sw, r+sw/2, shadow, 0)
	}
	rrect(dst, x, y, w, h, r, fill, sw)
}

func circle(dst *ebiten.Image, x, y, r float64, fill color.Color, sw float64) {
	shape(dst, pathEllipse(x, y, r, r, 0), fill, sw, ink)
}

func circleC(dst *ebiten.Image, x, y, r float64, fill color.Color, sw float64, sc color.Color) {
	shape(dst, pathEllipse(x, y, r, r, 0), fill, sw, sc)
}

func ellipse(dst *ebiten.Image, cx, cy, rx, ry, rot float64, fill color.Color, sw float64) {
	shape(dst, pathEllipse(cx, cy, rx, ry, rot), fill, sw, ink)
}

func poly(dst *ebiten.Image, fill color.Color, sw float64, pts ...float64) {
	concaveFill = !convex(pts)
	shape(dst, pathPoly(pts...), fill, sw, ink)
	concaveFill = false
}

func convex(pts []float64) bool {
	n := len(pts) / 2
	if n < 4 {
		return true
	}
	sign := 0.0
	for i := 0; i < n; i++ {
		x0, y0 := pts[2*i], pts[2*i+1]
		x1, y1 := pts[2*((i+1)%n)], pts[2*((i+1)%n)+1]
		x2, y2 := pts[2*((i+2)%n)], pts[2*((i+2)%n)+1]
		c := (x1-x0)*(y2-y1) - (y1-y0)*(x2-x1)
		if c != 0 {
			if sign != 0 && (c > 0) != (sign > 0) {
				return false
			}
			sign = c
		}
	}
	return true
}

func line(dst *ebiten.Image, x0, y0, x1, y1, w float64, c color.Color) {
	p := &vector.Path{}
	p.MoveTo(float32(x0), float32(y0))
	p.LineTo(float32(x1), float32(y1))
	strokePath(dst, p, w, c)
}

func star(dst *ebiten.Image, cx, cy, r, inner, rot float64, fill color.Color, sw float64) {
	pts := make([]float64, 0, 20)
	for i := 0; i < 10; i++ {
		rr := r
		if i%2 == 1 {
			rr = r * inner
		}
		a := rot - math.Pi/2 + float64(i)*math.Pi/5
		pts = append(pts, cx+math.Cos(a)*rr, cy+math.Sin(a)*rr)
	}
	poly(dst, fill, sw, pts...)
}

func sparkle(dst *ebiten.Image, cx, cy, r float64, c color.Color) {
	poly(dst, c, 0, cx, cy-r, cx+r*0.22, cy-r*0.22, cx+r, cy, cx+r*0.22, cy+r*0.22, cx, cy+r, cx-r*0.22, cy+r*0.22, cx-r, cy, cx-r*0.22, cy-r*0.22)
}

func fillRect(dst *ebiten.Image, x, y, w, h float64, c color.Color) {
	fillPath(dst, pathRoundRect(x, y, w, h, 0), c)
}

// ---------- texte ----------

type Align int

const (
	AL Align = iota
	AC
	AR
)

var (
	fontSource *text.GoTextFaceSource
	faceCache  = map[[2]int]*text.GoTextFace{}
)

func initFont() {
	src, err := text.NewGoTextFaceSource(bytes.NewReader(fredokaTTF))
	if err != nil {
		panic(err)
	}
	fontSource = src
}

func face(size float64, weight int) *text.GoTextFace {
	k := [2]int{int(size * 2), weight}
	if f, ok := faceCache[k]; ok {
		return f
	}
	f := &text.GoTextFace{Source: fontSource, Size: float64(k[0]) / 2}
	f.SetVariation(text.MustParseTag("wght"), float32(weight))
	faceCache[k] = f
	return f
}

func toAlign(a Align) text.Align {
	switch a {
	case AC:
		return text.AlignCenter
	case AR:
		return text.AlignEnd
	}
	return text.AlignStart
}

func drawStr(dst *ebiten.Image, s string, x, y, size float64, weight int, c color.Color, a Align) {
	op := &text.DrawOptions{}
	op.GeoM.Translate(x*S, y*S)
	op.ColorScale.ScaleWithColor(c)
	op.PrimaryAlign = toAlign(a)
	op.SecondaryAlign = text.AlignCenter
	op.LineSpacing = size * 1.15 * S
	text.Draw(dst, s, face(size*S, weight), op)
}

// txt : texte normal (poids 600), centré verticalement sur y.
func txt(dst *ebiten.Image, s string, x, y, size float64, c color.Color, a Align) {
	drawStr(dst, s, x, y, size, 600, c, a)
}

// txtB : texte gras.
func txtB(dst *ebiten.Image, s string, x, y, size float64, c color.Color, a Align) {
	drawStr(dst, s, x, y, size, 700, c, a)
}

// txtO : texte gras avec contour épais, comme les titres des maquettes.
func txtO(dst *ebiten.Image, s string, x, y, size float64, fill color.Color, a Align, ow float64) {
	n := 12
	if ow > 4 {
		n = 20
	}
	for _, rr := range []float64{ow, ow * 0.55} {
		for i := 0; i < n; i++ {
			an := float64(i) / float64(n) * 2 * math.Pi
			drawStr(dst, s, x+math.Cos(an)*rr, y+math.Sin(an)*rr, size, 700, ink, a)
		}
	}
	drawStr(dst, s, x, y, size, 700, fill, a)
}

func txtW(s string, size float64, weight int) float64 {
	w, _ := text.Measure(s, face(size, weight), size*1.15)
	return w
}

func wrap(s string, size float64, maxW float64) []string {
	var lines []string
	for _, para := range strings.Split(s, "\n") {
		words := strings.Fields(para)
		cur := ""
		for _, w := range words {
			try := w
			if cur != "" {
				try = cur + " " + w
			}
			if txtW(try, size, 600) > maxW && cur != "" {
				lines = append(lines, cur)
				cur = w
			} else {
				cur = try
			}
		}
		lines = append(lines, cur)
	}
	return lines
}
