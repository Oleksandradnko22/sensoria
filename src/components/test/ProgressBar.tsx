type Props = {
  current: number;
  total: number;
};

export default function ProgressBar({
  current,
  total,
}: Props) {
  const progress = (current / total) * 100;

  return (
    <div className="w-full">

      <div className="flex justify-between text-sm text-white/60 mb-3">
        <span>
          Питання {current} з {total}
        </span>

        <span>
          {Math.round(progress)}%
        </span>
      </div>

      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="
            h-full
            bg-gradient-to-r from-blue-400 to-purple-400
            transition-all duration-500
          "
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

    </div>
  );
}