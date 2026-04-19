import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Feature {
  id: number;
  icon: React.ElementType;
  title: string;
  description: string;
  image?: string;
  custom?: React.ReactNode;
}

interface FeaturesProps {
  features: Feature[];
  progressGradientLight?: string;
  progressGradientDark?: string;
}

export function Features({
  features,
  progressGradientLight = "bg-gradient-to-r from-blue-400 to-blue-500",
  progressGradientDark = "bg-gradient-to-r from-blue-300 to-blue-400",
}: FeaturesProps) {
  const [currentFeature, setCurrentFeature] = useState(0);
  const [progress, setProgress] = useState(0);
  const featureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 100 : prev + 1));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      const t = setTimeout(() => {
        setCurrentFeature((prev) => (prev + 1) % features.length);
        setProgress(0);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [progress, features.length]);

  useEffect(() => {
    const el = featureRefs.current[currentFeature];
    const container = containerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      container.scrollTo({
        left: el.offsetLeft - (containerRect.width - elRect.width) / 2,
        behavior: "smooth",
      });
    }
  }, [currentFeature]);

  const handleFeatureClick = (index: number) => {
    setCurrentFeature(index);
    setProgress(0);
  };

  return (
    <div className="grid lg:grid-cols-2 lg:gap-16 gap-8 items-center">
      {/* Left — feature list */}
      <div
        ref={containerRef}
        className="lg:space-y-8 md:space-x-6 lg:space-x-0 overflow-x-auto overflow-hidden lg:overflow-visible flex lg:flex-col flex-row pb-4 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {features.map((feature, index) => {
          const Icon = feature.icon;
          const isActive = currentFeature === index;
          return (
            <div
              key={feature.id}
              ref={(el) => { featureRefs.current[index] = el; }}
              className="relative cursor-pointer flex-shrink-0"
              onClick={() => handleFeatureClick(index)}
            >
              <div
                className={`flex lg:flex-row flex-col items-start space-x-4 p-3 max-w-sm lg:max-w-2xl transition-all duration-300 ${
                  isActive
                    ? "bg-white shadow-xl rounded-xl border border-gray-200"
                    : ""
                }`}
              >
                <div
                  className={`p-3 hidden md:block rounded-full transition-all duration-300 ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-blue-100 text-blue-600"
                  }`}
                >
                  <Icon size={24} />
                </div>
                <div className="flex-1">
                  <h3
                    className={`text-lg md:mt-4 lg:mt-0 font-semibold mb-2 transition-colors duration-300 ${
                      isActive ? "text-gray-900" : "text-gray-500"
                    }`}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className={`transition-colors duration-300 text-sm ${
                      isActive ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {feature.description}
                  </p>
                  <div className="mt-4 bg-gray-100 rounded-sm h-1 overflow-hidden">
                    {isActive && (
                      <motion.div
                        className={`h-full ${progressGradientLight}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.1, ease: "linear" }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right — image */}
      <div className="relative order-1 max-w-lg mx-auto lg:order-2">
        <motion.div
          key={currentFeature}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {features[currentFeature].custom ? (
            features[currentFeature].custom
          ) : features[currentFeature].image ? (
            <img
              className="rounded-2xl border border-gray-100 shadow-lg w-full"
              src={features[currentFeature].image}
              alt={features[currentFeature].title}
              width={600}
              height={400}
            />
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
