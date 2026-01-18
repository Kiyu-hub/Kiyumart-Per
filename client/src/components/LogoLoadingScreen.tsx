/**
 * LogoLoadingScreen - Premium animated loading experience for KiyuMart
 * 
 * Features:
 * - Animated logo with bounce, rotate, and scale effects
 * - Smooth spring physics for natural motion
 * - Light/dark mode support
 * - Respects prefers-reduced-motion for accessibility
 * - GPU-optimized transforms for smooth performance
 * - Seamless loop animation during loading
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import appLogo from "@assets/kiyumart_logo.png";

interface LogoLoadingScreenProps {
  /** Whether the app is still loading */
  isLoading?: boolean;
  /** Minimum display time in ms (prevents flash) */
  minDisplayTime?: number;
  /** Optional loading message */
  message?: string;
}

export default function LogoLoadingScreen({
  isLoading = true,
  minDisplayTime = 1500,
  message = "Loading...",
}: LogoLoadingScreenProps) {
  const [showLoader, setShowLoader] = useState(true);
  const [hasMinTimePassed, setHasMinTimePassed] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Ensure minimum display time for smooth UX
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMinTimePassed(true);
    }, minDisplayTime);

    return () => clearTimeout(timer);
  }, [minDisplayTime]);

  // Hide loader when both loading is complete and min time has passed
  useEffect(() => {
    if (!isLoading && hasMinTimePassed) {
      setShowLoader(false);
    }
  }, [isLoading, hasMinTimePassed]);

  // Animation variants for the logo container
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.3,
        when: "beforeChildren",
      },
    },
    exit: {
      opacity: 0,
      scale: 1.1,
      transition: {
        duration: 0.4,
        ease: "easeInOut",
      },
    },
  };

  // Main logo animation - bouncing with rotation
  const logoVariants = {
    hidden: {
      scale: 0,
      rotate: -180,
      opacity: 0,
    },
    visible: {
      scale: 1,
      rotate: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 260,
        damping: 20,
        duration: 0.8,
      },
    },
  };

  // Continuous bounce animation
  const bounceAnimation = shouldReduceMotion
    ? {}
    : {
        y: [0, -20, 0],
        scale: [1, 1.05, 1],
        rotate: [0, 5, -5, 0],
        transition: {
          duration: 1.5,
          repeat: Infinity,
          repeatType: "loop" as const,
          ease: "easeInOut",
        },
      };

  // Shadow animation synced with bounce
  const shadowVariants = {
    animate: shouldReduceMotion
      ? {}
      : {
          scale: [1, 0.8, 1],
          opacity: [0.3, 0.15, 0.3],
          transition: {
            duration: 1.5,
            repeat: Infinity,
            repeatType: "loop" as const,
            ease: "easeInOut",
          },
        },
  };

  // Text animation
  const textVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.5,
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  // Loading dots animation
  const dotsContainerVariants = {
    animate: {
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const dotVariants = {
    animate: shouldReduceMotion
      ? { opacity: [0.3, 1, 0.3] }
      : {
          y: [0, -10, 0],
          opacity: [0.3, 1, 0.3],
          transition: {
            duration: 0.6,
            repeat: Infinity,
            repeatType: "loop" as const,
            ease: "easeInOut",
          },
        },
  };

  // Pulse ring animation
  const ringVariants = {
    animate: shouldReduceMotion
      ? {}
      : {
          scale: [1, 1.5, 2],
          opacity: [0.5, 0.2, 0],
          transition: {
            duration: 2,
            repeat: Infinity,
            repeatType: "loop" as const,
            ease: "easeOut",
          },
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
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background dark:bg-gray-900"
          data-testid="logo-loading-screen"
        >
          {/* Animated background gradient */}
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute inset-0 opacity-30 dark:opacity-20"
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      background: [
                        "radial-gradient(circle at 30% 30%, rgba(20, 184, 166, 0.3) 0%, transparent 50%)",
                        "radial-gradient(circle at 70% 70%, rgba(20, 184, 166, 0.3) 0%, transparent 50%)",
                        "radial-gradient(circle at 30% 30%, rgba(20, 184, 166, 0.3) 0%, transparent 50%)",
                      ],
                    }
              }
              transition={{
                duration: 4,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut",
              }}
            />
          </div>

          {/* Main content container */}
          <div className="relative flex flex-col items-center">
            {/* Pulse rings behind logo */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="absolute w-32 h-32 rounded-full border-2 border-primary/30"
                variants={ringVariants}
                animate="animate"
              />
              <motion.div
                className="absolute w-32 h-32 rounded-full border-2 border-primary/30"
                variants={ringVariants}
                animate="animate"
                style={{ animationDelay: "0.5s" }}
                transition={{ delay: 0.5 }}
              />
            </div>

            {/* Logo with shadow */}
            <div className="relative">
              {/* Shadow element */}
              <motion.div
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-20 h-4 bg-black/20 dark:bg-black/40 rounded-full blur-md"
                variants={shadowVariants}
                animate="animate"
              />

              {/* Animated Logo */}
              <motion.div
                variants={logoVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10"
              >
                <motion.img
                  src={appLogo}
                  alt="KiyuMart"
                  className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-2xl"
                  animate={bounceAnimation}
                  style={{
                    filter: "drop-shadow(0 10px 20px rgba(20, 184, 166, 0.3))",
                  }}
                  data-testid="loading-logo"
                />
              </motion.div>
            </div>

            {/* Brand name with animation */}
            <motion.div
              variants={textVariants}
              initial="hidden"
              animate="visible"
              className="mt-8 text-center"
            >
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-transparent">
                KiyuMart
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Quality meets affordability
              </p>
            </motion.div>

            {/* Loading indicator with animated dots */}
            <motion.div
              className="mt-8 flex items-center gap-2"
              variants={dotsContainerVariants}
              animate="animate"
            >
              <span className="text-sm text-muted-foreground">{message}</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((index) => (
                  <motion.span
                    key={index}
                    className="w-2 h-2 bg-primary rounded-full"
                    variants={dotVariants}
                    animate="animate"
                    custom={index}
                    style={{ animationDelay: `${index * 0.2}s` }}
                    transition={{ delay: index * 0.2 }}
                  />
                ))}
              </div>
            </motion.div>

            {/* Progress bar */}
            <motion.div
              className="mt-6 w-48 h-1 bg-muted rounded-full overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-teal-400 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{
                  duration: minDisplayTime / 1000,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          </div>

          {/* Footer branding */}
          <motion.p
            className="absolute bottom-8 text-xs text-muted-foreground/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            © 2026 KiyuMart. All rights reserved.
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
    // Simulate app initialization (replace with actual init logic)
    const initApp = async () => {
      // Wait for critical resources
      await Promise.all([
        // Add your initialization promises here
        new Promise((resolve) => setTimeout(resolve, 500)), // Minimum load time
      ]);
      setIsLoading(false);
    };

    initApp();
  }, []);

  return { isLoading, setIsLoading };
}
