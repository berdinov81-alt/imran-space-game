# V6 verification — 4 October 2026

66 / 66 automated tests pass against the shipped gameplay loop, profile, mixer and PCM assets.

New coverage: cached decoding, voice sprite offsets, music ducking, priority interruption with stale onended callbacks, at most two music sources during rapid scene switches, finished fanfare persistence, background suspend and gesture lock, pending speech discarded on pause, independent zero-volume channels and mute, bounded effects and source cleanup, unavailable audio or missing assets, unclipped audible PCM and all 16 Russian cue boundaries, preservation of old mute preferences and numeric volume validation.

All V5 gameplay coverage retained: 30 unique commanders, formations, rare capsules, five weapon ranks, Tesla, overdrive, multi-touch, hit detection, bounded projectiles, progress migration, paused victory, immediate and exactly-once awards.

Browser QA: 390×844, 360×640 and 1280×720. First gesture unlock, voice preview, volume persistence, battle/boss/victory music, background suspend, restart from pause and returning to the menu checked using the real AudioContext. No console errors. Deterministic QA controls remain only in the work fixture, outside shipped files.

Native source projects: version 6.0.0 / build 600. Android and iOS resources synchronized; audio and gameplay assets checked by SHA-256. Standalone inline syntax, embedded assets and archive CRC checked. No APK/AAB/IPA compilation, signing or physical-device audio validation is claimed; SDK/JDK and Mac/Xcode builds remain outstanding.
