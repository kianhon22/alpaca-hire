const CircularProgress = ({ percentage, size = 50, strokeWidth = 6 }) => {
  const rounded = Math.round(percentage);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - rounded / 100);

  // Dynamic color based on percentage
  let color = "#16a34a"; // default green
  if (rounded <= 50) color = "#ef4444"; // red
  else if (rounded < 70) color = "#facc15"; // yellow

  return (
    <svg width={size} height={size} className="inline-block">
      <circle
        stroke="#e5e7eb" // background circle
        fill="transparent"
        strokeWidth={strokeWidth}
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        stroke={color} // dynamic color
        fill="transparent"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} // start from top
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        className="text-xs font-medium"
      >
        {rounded}%
      </text>
    </svg>
  );
};

export default CircularProgress;
