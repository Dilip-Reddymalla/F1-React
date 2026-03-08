import { useEffect, useState } from "react";
import "./splashScreen.css";

export function SplashScreen() {
    const [isVisible, setIsVisible] = useState(false);
    const [isFadingOut, setIsFadingOut] = useState(false);

    useEffect(() => {
        // Run splash screen on every reload during development for testing
        // You can remove `|| true` later to restore the once-per-session behavior
        const hasSeenSplash = sessionStorage.getItem("f1_splash_seen") && false;

        if (!hasSeenSplash) {
            setIsVisible(true);
            sessionStorage.setItem("f1_splash_seen", "true");

            // Start fade out at 4.2s (text and car finish at 4.5s)
            const fadeTimer = setTimeout(() => {
                setIsFadingOut(true);
            }, 4200);

            // completely remove from DOM after fade out transition (0.8s) + buffer
            const removeTimer = setTimeout(() => {
                setIsVisible(false);
            }, 5500);

            return () => {
                clearTimeout(fadeTimer);
                clearTimeout(removeTimer);
            };
        }
    }, []);

    if (!isVisible) return null;

    return (
        <div
            className={`splash-container ${isFadingOut ? "hidden" : ""}`}
            style={{ display: isVisible ? 'flex' : 'none' }}
        >
            <div className="track-lines"></div>

            <div className="splash-text-wrapper">
                <h1 className="splash-text">Let's Go Racing</h1>
                <div className="splash-subtext">Welcome to the Hub</div>
            </div>

            <div className="splash-car-container">
                {/* Top-down F1 Car SVG - Red Bull 2026 Style */}
                <svg className="splash-car-svg" viewBox="0 0 100 250" xmlns="http://www.w3.org/2000/svg">
                    {/* Base Shadow */}
                    <rect x="15" y="40" width="70" height="180" fill="rgba(0,0,0,0.4)" rx="10" filter="blur(5px)" />

                    {/* Tires */}
                    <rect x="5" y="40" width="22" height="42" rx="4" fill="#111" />
                    <rect x="73" y="40" width="22" height="42" rx="4" fill="#111" />
                    <rect x="5" y="165" width="24" height="48" rx="4" fill="#111" />
                    <rect x="71" y="165" width="24" height="48" rx="4" fill="#111" />

                    {/* Suspension */}
                    <line x1="25" y1="60" x2="45" y2="70" stroke="#222" strokeWidth="3" />
                    <line x1="75" y1="60" x2="55" y2="70" stroke="#222" strokeWidth="3" />
                    <line x1="27" y1="185" x2="40" y2="175" stroke="#222" strokeWidth="3" />
                    <line x1="73" y1="185" x2="60" y2="175" stroke="#222" strokeWidth="3" />

                    {/* Front Wing */}
                    <path d="M 12 25 Q 50 20 88 25 L 92 35 L 8 35 Z" fill="#001a57" />
                    <rect x="15" y="30" width="70" height="4" fill="#cc0000" />
                    <rect x="42" y="22" width="16" height="16" fill="#cc0000" />
                    <circle cx="50" cy="30" r="4" fill="#ffd700" />

                    {/* Nose */}
                    <path d="M 44 40 L 56 40 L 62 90 L 38 90 Z" fill="#001a57" />
                    <circle cx="50" cy="65" r="5" fill="#ffd700" />
                    <path d="M 45 75 Q 50 85 55 75" fill="none" stroke="#cc0000" strokeWidth="2" />

                    {/* Cockpit & Halo */}
                    <rect x="34" y="90" width="32" height="45" fill="#001845" rx="4" />
                    <path d="M 36 105 Q 50 88 64 105" fill="none" stroke="#111" strokeWidth="3.5" />
                    <line x1="50" y1="96" x2="50" y2="115" stroke="#111" strokeWidth="3" />
                    <circle cx="50" cy="118" r="7" fill="#ffcc00" />

                    {/* Engine Cover & Sidepods */}
                    <path d="M 28 115 L 72 115 L 78 165 L 62 195 L 38 195 L 22 165 Z" fill="#001a57" />

                    {/* Red Bull branding swoosh patterns */}
                    <path d="M 32 140 C 42 125 58 125 68 140 C 58 150 42 150 32 140" fill="#cc0000" />
                    <circle cx="50" cy="138" r="8" fill="#ffd700" />

                    {/* Rear Wing */}
                    <rect x="22" y="205" width="56" height="22" fill="#001a57" rx="2" />
                    <rect x="35" y="195" width="30" height="15" fill="#222" />
                    <rect x="25" y="210" width="50" height="6" fill="#cc0000" />
                    <text x="50" y="224" fontFamily="sans-serif" fontSize="6" fill="white" textAnchor="middle" fontWeight="bold">ORACLE</text>
                </svg>
            </div>
        </div>
    );
}

export default SplashScreen;
