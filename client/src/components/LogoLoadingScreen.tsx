/**
 * LogoLoadingScreen - Premium animated loading experience for KiyuMart
 * 
 * Features:
 * - Animated logo with bounce and scale effects
 * - Confetti and sparkle particles
 * - Smooth spring physics for natural motion
 * - Respects prefers-reduced-motion for accessibility
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import appLogo from "@assets/kiyumart_logo.png";
import { useMobileDevice } from "@/hooks/useMobileDevice";

// Use the dark logo as the heading image on the loading screen (served from attached_assets)
const SCRIPT_HEADING_LOGO = "/attached_assets/kiyumart_logo_dark.png";

interface LogoLoadingScreenProps {
  isLoading?: boolean;
  minDisplayTime?: number;
  message?: string;
}

// Confetti particle
const Confetti = ({ delay, x }: { delay: number; x: number }) => {
  const colors = ["#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#10b981"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-sm"
      style={{ backgroundColor: color, left: `${x}%`, top: "-10px" }}
      animate={{
        y: [0, 400],
        x: [0, (Math.random() - 0.5) * 100],
        rotate: [0, 720],
        opacity: [1, 0],
      }}
      transition={{
        duration: 3,
        delay,
        repeat: Infinity,
        repeatDelay: 2,
        ease: "easeIn",
      }}
    />
  );
};

export default function LogoLoadingScreen({
  isLoading = true,
  minDisplayTime = 2500,
  message = "Getting your experience ready...",
}: LogoLoadingScreenProps) {
  const [showLoader, setShowLoader] = useState(true);
  const [hasMinTimePassed, setHasMinTimePassed] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const { isMobile } = useMobileDevice();

  // Mobile gets a minimal "icon + animated wordmark" splash. Desktop keeps
  // the full original animation (logo + rings + sparkles + script heading).
  if (isMobile) {
    return (
      <MobileSplash
        showLoader={showLoader}
        setShowLoader={setShowLoader}
        isLoading={isLoading}
        minDisplayTime={minDisplayTime}
        hasMinTimePassed={hasMinTimePassed}
        setHasMinTimePassed={setHasMinTimePassed}
        shouldReduceMotion={!!shouldReduceMotion}
      />
    );
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMinTimePassed(true);
    }, minDisplayTime);
    return () => clearTimeout(timer);
  }, [minDisplayTime]);

  useEffect(() => {
    if (!isLoading && hasMinTimePassed) {
      setShowLoader(false);
    }
  }, [isLoading, hasMinTimePassed]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.5, staggerChildren: 0.15 },
    },
    exit: {
      opacity: 0,
      scale: 1.1,
      transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
    },
  };

  const logoVariants = {
    hidden: { scale: 0, rotate: -180, opacity: 0 },
    visible: {
      scale: 1,
      rotate: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 200, damping: 12 },
    },
  };

  const textVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { delay: 0.4, duration: 0.6, ease: [0.4, 0, 0.2, 1] },
    },
  };

  return (
    <AnimatePresence mode="wait">
      {showLoader && (
        <motion.div
          key="loader"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #f0fdfa 0%, #ccfbf1 40%, #99f6e4 70%, #5eead4 100%)",
          }}
          data-testid="logo-loading-screen"
        >
          {/* small component that shows the heading either as an image or text */}
          
          {/* Animated background circles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${150 + i * 100}px`,
                  height: `${150 + i * 100}px`,
                  left: `${10 + i * 15}%`,
                  top: `${5 + i * 10}%`,
                  background: `radial-gradient(circle, rgba(20, 184, 166, ${0.15 - i * 0.02}) 0%, transparent 70%)`,
                }}
                animate={shouldReduceMotion ? {} : {
                  scale: [1, 1.2, 1],
                  x: [0, 20, 0],
                  y: [0, -20, 0],
                }}
                transition={{
                  duration: 4 + i,
                  delay: i * 0.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>

          {/* Confetti rain */}
          {!shouldReduceMotion && [...Array(15)].map((_, i) => (
            <Confetti key={i} delay={i * 0.3} x={5 + i * 6} />
          ))}

          {/* Main Logo Section */}
          <div className="relative flex flex-col items-center z-10 mb-8">
            {/* Glowing background for logo */}
            <motion.div
              className="absolute w-44 h-44 md:w-56 md:h-56 rounded-full blur-2xl"
              style={{ background: "radial-gradient(circle, rgba(20, 184, 166, 0.5) 0%, transparent 70%)" }}
              animate={shouldReduceMotion ? {} : {
                scale: [1, 1.3, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Rotating rings */}
            <motion.div
              className="absolute w-40 h-40 md:w-52 md:h-52 rounded-full border-4 border-dashed border-teal-400/30"
              animate={shouldReduceMotion ? {} : { rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute w-48 h-48 md:w-60 md:h-60 rounded-full border-2 border-dotted border-teal-300/20"
              animate={shouldReduceMotion ? {} : { rotate: -360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            />

            {/* Logo with bounce — original desktop animation. */}
            <motion.div variants={logoVariants} className="relative z-10">
              <motion.img
                src={appLogo}
                alt="KiyuMart"
                className="w-32 h-32 md:w-44 md:h-44 object-contain"
                animate={shouldReduceMotion ? {} : {
                  y: [0, -15, 0],
                  scale: [1, 1.05, 1],
                }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: "drop-shadow(0 20px 40px rgba(13, 148, 136, 0.4))" }}
              />
            </motion.div>

            {/* Sparkle stars around logo */}
            {!shouldReduceMotion && [...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute text-yellow-400"
                style={{
                  left: `${50 + Math.cos(i * Math.PI / 4) * 45}%`,
                  top: `${50 + Math.sin(i * Math.PI / 4) * 45}%`,
                  transform: "translate(-50%, -50%)",
                }}
                animate={{
                  scale: [0, 1.2, 0],
                  opacity: [0, 1, 0],
                  rotate: [0, 180, 360],
                }}
                transition={{
                  duration: 1.5,
                  delay: i * 0.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                ✦
              </motion.div>
            ))}
          </div>

          {/* Brand name */}
          <motion.div variants={textVariants} className="text-center z-10 mb-6">
            {/* Use the script logo for the large heading; fall back to text if the image fails */}
            <LogoHeading />
            <motion.p
              className="mt-3 text-lg text-teal-700 font-medium"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Where Quality Meets Affordability
            </motion.p>
          </motion.div>

          {/* Loading message and progress */}
          <motion.div
            className="flex flex-col items-center gap-4 z-10 mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <span className="text-teal-700 font-semibold text-base">{message}</span>

            {/* Bouncing dots */}
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-4 h-4 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg"
                  animate={shouldReduceMotion ? {} : {
                    y: [0, -15, 0],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 0.5,
                    delay: i * 0.12,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>

            {/* Progress bar with shine effect */}
            <div className="w-64 md:w-80 h-3 bg-white/60 rounded-full overflow-hidden shadow-inner backdrop-blur-sm">
              <motion.div
                className="h-full rounded-full relative overflow-hidden"
                style={{
                  background: "linear-gradient(90deg, #14b8a6, #10b981, #06b6d4)",
                }}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{
                  duration: minDisplayTime / 1000,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                {/* Shine effect */}
                <motion.div
                  className="absolute inset-0 w-1/4"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                  }}
                  animate={{ x: ["-100%", "400%"] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </motion.div>
            </div>
          </motion.div>

          {/* Footer */}
          <motion.p
            className="absolute bottom-4 text-xs text-teal-600/60 font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            © 2026 KiyuMart • Your happiness, delivered
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook for using the loading screen with app initialization
 */
export function useAppLoading() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      await Promise.all([
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      setIsLoading(false);
    };

    initApp();
  }, []);

  return { isLoading, setIsLoading };
}


/**
 * MobileSplash — compact mobile-only splash screen.
 *
 * Shows the bouncing + spinning logo icon and the wordmark "kiyumart"
 * spelled out letter-by-letter underneath as the loading indicator.
 * White background to match the OS splash hand-off.
 */
interface MobileSplashProps {
  showLoader: boolean;
  setShowLoader: (b: boolean) => void;
  isLoading: boolean;
  minDisplayTime: number;
  hasMinTimePassed: boolean;
  setHasMinTimePassed: (b: boolean) => void;
  shouldReduceMotion: boolean;
}

function MobileSplash({
  showLoader,
  setShowLoader,
  isLoading,
  minDisplayTime,
  hasMinTimePassed,
  setHasMinTimePassed,
  shouldReduceMotion,
}: MobileSplashProps) {
  useEffect(() => {
    const timer = setTimeout(() => setHasMinTimePassed(true), minDisplayTime);
    return () => clearTimeout(timer);
  }, [minDisplayTime, setHasMinTimePassed]);

  useEffect(() => {
    if (!isLoading && hasMinTimePassed) setShowLoader(false);
  }, [isLoading, hasMinTimePassed, setShowLoader]);

  const letters = "kiyumart".split("");

  return (
    <AnimatePresence mode="wait">
      {showLoader && (
        <motion.div
          key="mobile-loader"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          data-testid="logo-loading-screen"
        >
          {/* Logo icon — small, jumping with a flip */}
          <motion.img
            src={appLogo}
            alt="KiyuMart"
            className="w-14 h-14 object-contain"
            animate={
              shouldReduceMotion
                ? {}
                : {
                    y: [0, -22, 0, -10, 0],
                    rotateY: [0, 360],
                    scale: [1, 1.08, 1, 1.04, 1],
                  }
            }
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.25, 0.5, 0.75, 1],
            }}
            style={{ filter: "drop-shadow(0 10px 18px rgba(13,148,136,0.25))" }}
          />

          {/* Wordmark — letter by letter */}
          <div className="mt-6 flex items-baseline justify-center" data-testid="splash-wordmark">
            {letters.map((ch, i) => (
              <motion.span
                key={`${ch}-${i}`}
                className="text-2xl font-extrabold tracking-tight"
                style={{
                  background: "linear-gradient(90deg, #0d9488, #14b8a6, #10b981)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={
                  shouldReduceMotion
                    ? { opacity: 1, y: 0 }
                    : {
                        opacity: [0, 1, 1, 0.7, 1],
                        y: [8, 0, 0, 0, 0],
                      }
                }
                transition={{
                  duration: 1.8,
                  delay: i * 0.12,
                  repeat: Infinity,
                  repeatDelay: 0.6,
                  ease: "easeInOut",
                }}
              >
                {ch}
              </motion.span>
            ))}
          </div>

          {/* Subtle three-dot pulse below the wordmark */}
          <div className="mt-5 flex gap-1.5" data-testid="splash-dots">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-teal-500"
                animate={
                  shouldReduceMotion ? {} : { opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }
                }
                transition={{ duration: 1, delay: i * 0.15, repeat: Infinity, ease: "easeInOut" }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * LogoHeading - renders the big loading-screen heading.
 * Always uses the logo image; shows a transparent placeholder while loading
 * so the old text never flashes on screen.
 */
function LogoHeading() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="w-56 md:w-72 h-16 md:h-20 relative mx-auto flex items-center justify-center">
      {/* Always render the image so the browser starts fetching immediately */}
      <motion.img
        src={SCRIPT_HEADING_LOGO}
        alt="KiyuMart"
        className="w-56 md:w-72 h-auto object-contain mx-auto"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: imageLoaded ? 1 : 0, scale: imageLoaded ? 1 : 0.9 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ filter: 'drop-shadow(0 20px 40px rgba(13, 148, 136, 0.2))' }}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageFailed(true)}
      />
      {/* Only show text fallback if the image actually fails to load */}
      {imageFailed && (
        <h1 className="absolute inset-0 flex items-center justify-center text-5xl md:text-6xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent drop-shadow-sm">Kiyu</span>
          <span className="bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 bg-clip-text text-transparent drop-shadow-sm">Mart</span>
        </h1>
      )}
    </div>
  );
}
