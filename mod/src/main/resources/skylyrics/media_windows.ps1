# SkyLyrics - lit le lecteur multimédia Windows (Spotify en priorité) via l'API SMTC
# et écrit une ligne JSON par mise à jour sur la sortie standard.
param([string]$ArtDir, [int]$ParentPid)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Emit($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    function Await($op, [Type]$type) {
        $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
        $null = $task.Wait(5000)
        return $task.Result
    }
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
    Emit @{ active = $false; error = "SMTC indisponible: $($_.Exception.Message)" }
    exit 2
}

$lastKey = ''
$lastArt = ''
$ErrorActionPreference = 'Continue'
while ($true) {
    if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
    try {
        $session = $null
        foreach ($s in $manager.GetSessions()) {
            if ($s.SourceAppUserModelId -like '*Spotify*') { $session = $s; break }
        }
        if ($null -eq $session) { $session = $manager.GetCurrentSession() }
        if ($null -eq $session) {
            Emit @{ active = $false }
        } else {
            $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $tl = $session.GetTimelineProperties()
            $pb = $session.GetPlaybackInfo()
            $playing = ([string]$pb.PlaybackStatus) -eq 'Playing'
            $key = "$($props.Artist)|$($props.Title)"
            if ($key -ne $lastKey) {
                $lastKey = $key
                $lastArt = ''
                if ($null -ne $props.Thumbnail -and $ArtDir) {
                    try {
                        $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                        $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
                        $file = Join-Path $ArtDir ('cover_' + [Math]::Abs($key.GetHashCode()) + '.img')
                        $fs = [System.IO.File]::Create($file)
                        $net.CopyTo($fs)
                        $fs.Close(); $net.Close()
                        $lastArt = $file
                    } catch { $lastArt = '' }
                }
            }
            # Position calculée au dernier moment (la pochette peut prendre du temps à lire)
            $tl = $session.GetTimelineProperties()
            $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $pos = [double]$tl.Position.TotalMilliseconds
            $updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
            if ($playing -and $updated -gt 0 -and $updated -le $now) { $pos += ($now - $updated) }
            Emit ([ordered]@{
                active  = $true
                app     = [string]$session.SourceAppUserModelId
                title   = [string]$props.Title
                artist  = [string]$props.Artist
                album   = [string]$props.AlbumTitle
                pos     = [long]$pos
                dur     = [long]$tl.EndTime.TotalMilliseconds
                playing = $playing
                art     = $lastArt
            })
        }
    } catch {
        Emit @{ active = $false; error = [string]$_.Exception.Message }
    }
    Start-Sleep -Milliseconds 250
}
