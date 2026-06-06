type Props = {
  text: string;
  name: string;
  age: string;
  onNext: () => void;
};

export default function TestimonialCard({ text, name, age, onNext }: Props) {
  return (
    <div className="
      relative

      w-[510px]
      min-h-[330px]
      p-12
      rounded-3xl

      bg-white/10
      backdrop-blur-2xl

      border border-white/20

      text-white

      flex flex-col justify-between

      shadow-[0_20px_80px_rgba(59,130,246,0.35)]

      transition duration-500 hover:scale-[1.02]
    ">

      {/* GLOW LAYER */}
      <div className="
        absolute inset-0 rounded-3xl
        bg-gradient-to-br from-white/20 via-transparent to-white/10
        opacity-40 pointer-events-none
      "/>

      {/* TEXT */}
      <p className="text-xl leading-[1.7] text-white/90 max-w-[480px] relative z-10">
        {text}
      </p>

      {/* PROFILE + ARROW */}
      <div className="flex items-center justify-between pt-12 relative z-10">

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-lg">
            {name[0]}
          </div>

          <div>
            <p className="font-semibold text-white text-xl">
              {name}
            </p>
            <p className="text-white/60 text-base">
              {age}
            </p>
          </div>
        </div>

        {/* BUTTON */}
        <button 
          onClick={onNext}
          className="
            w-11 h-11
            rounded-full

            bg-white/10
            hover:bg-white/30

            backdrop-blur-md

            flex items-center justify-center
            transition

            hover:scale-110
          "
        >
          →
        </button>

      </div>

    </div>
  );
}