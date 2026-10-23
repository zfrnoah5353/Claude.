package main

import (
	"math"
	"math/rand"

	"github.com/hajimehoshi/ebiten/v2/audio"
)

const sampleRate = 44100

// Tous les sons sont synthétisés au démarrage : aucun fichier audio externe.
type Audio struct {
	ctx     *audio.Context
	sounds  map[string][]byte
	players []*audio.Player
	last    map[string]float64
	muted   *bool
}

func newAudio(muted *bool) *Audio {
	a := &Audio{ctx: audio.NewContext(sampleRate), sounds: map[string][]byte{}, last: map[string]float64{}, muted: muted}
	rng := rand.New(rand.NewSource(1))
	env := func(t, dur, attack float64) float64 {
		if t < attack {
			return t / attack
		}
		return math.Exp(-4 * (t - attack) / dur)
	}
	sine := func(f, t float64) float64 { return math.Sin(2 * math.Pi * f * t) }
	a.sounds["pop"] = synth(0.14, func(t float64) float64 {
		return sine(420+t*2600, t) * env(t, 0.1, 0.004) * 0.7
	})
	a.sounds["coin"] = synth(0.16, func(t float64) float64 {
		f := 1318.5
		if t > 0.05 {
			f = 1760
		}
		return (sine(f, t) + 0.3*sine(f*2, t)) * env(t, 0.12, 0.002) * 0.35
	})
	a.sounds["tap"] = synth(0.06, func(t float64) float64 {
		return sine(260-t*1200, t) * env(t, 0.04, 0.002) * 0.6
	})
	a.sounds["click"] = synth(0.05, func(t float64) float64 {
		return sine(880, t) * env(t, 0.03, 0.002) * 0.3
	})
	a.sounds["buy"] = synth(0.25, func(t float64) float64 {
		f := 660.0
		if t > 0.09 {
			f = 990
		}
		return (sine(f, t) + 0.25*sine(f*3, t)) * env(t, 0.2, 0.004) * 0.4
	})
	a.sounds["error"] = synth(0.18, func(t float64) float64 {
		v := sine(180, t)
		if v > 0 {
			v = 0.6
		} else {
			v = -0.6
		}
		return v * env(t, 0.15, 0.003) * 0.25
	})
	a.sounds["wobble"] = synth(0.12, func(t float64) float64 {
		return sine(300+math.Sin(t*60)*40, t) * env(t, 0.1, 0.01) * 0.3
	})
	a.sounds["crack"] = synth(0.2, func(t float64) float64 {
		return (rng.Float64()*2 - 1) * env(t, 0.08, 0.001) * 0.5
	})
	arp := func(notes []float64, step, tail float64, vol float64) []byte {
		dur := step*float64(len(notes)) + tail
		return synth(dur, func(t float64) float64 {
			v := 0.0
			for i, n := range notes {
				st := float64(i) * step
				if t >= st {
					tt := t - st
					v += (sine(n, tt) + 0.3*sine(n*2, tt)) * env(tt, tail, 0.004)
				}
			}
			return v * vol
		})
	}
	a.sounds["reveal"] = arp([]float64{523.3, 659.3, 784, 1046.5}, 0.07, 0.35, 0.22)
	a.sounds["legend"] = arp([]float64{523.3, 659.3, 784, 1046.5, 1318.5, 1568, 2093}, 0.08, 0.8, 0.2)
	a.sounds["levelup"] = arp([]float64{784, 1046.5, 1318.5}, 0.06, 0.3, 0.2)
	a.sounds["boss"] = synth(0.18, func(t float64) float64 {
		return sine(90-t*200, t) * env(t, 0.15, 0.002) * 0.8
	})
	a.sounds["slam"] = synth(0.5, func(t float64) float64 {
		return ((rng.Float64()*2-1)*0.5 + sine(55, t)) * env(t, 0.4, 0.002) * 0.7
	})
	return a
}

func synth(dur float64, f func(t float64) float64) []byte {
	n := int(dur * sampleRate)
	b := make([]byte, n*4)
	for i := 0; i < n; i++ {
		t := float64(i) / sampleRate
		v := clamp(f(t), -1, 1)
		// petit fondu de sortie pour éviter les clics
		if rem := float64(n-i) / sampleRate; rem < 0.01 {
			v *= rem / 0.01
		}
		s := int16(v * 32767 * 0.8)
		b[i*4] = byte(s)
		b[i*4+1] = byte(s >> 8)
		b[i*4+2] = byte(s)
		b[i*4+3] = byte(s >> 8)
	}
	return b
}

func (a *Audio) play(name string, now float64) {
	if a == nil || *a.muted {
		return
	}
	minGap := 0.03
	if name == "coin" {
		minGap = 0.07
	}
	if now-a.last[name] < minGap {
		return
	}
	a.last[name] = now
	b, ok := a.sounds[name]
	if !ok {
		return
	}
	p := a.ctx.NewPlayerFromBytes(b)
	p.Play()
	// on garde une référence le temps que le son se termine
	a.players = append(a.players, p)
	if len(a.players) > 24 {
		old := a.players[0]
		a.players = a.players[1:]
		if !old.IsPlaying() {
			_ = old.Close()
		}
	}
}
