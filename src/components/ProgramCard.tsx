type Props = {
  title: string;
  description: string;
};

export default function ProgramCard({ title, description }: Props) {
  return (
    <div className="
      p-6 rounded-2xl
      bg-white/10 backdrop-blur-xl
      border border-white/20
      text-white
      transition duration-300
      hover:scale-[1.02] hover:bg-white/15
    ">
      
      <h3 className="text-xl font-semibold mb-3">
        {title}
      </h3>

      <p className="text-white/70 text-sm leading-relaxed">
        {description}
      </p>

      <button className="
        mt-6 text-sm font-medium
        text-white/80 hover:text-white
        transition
      ">
        Детальніше →
      </button>

    </div>
  );
}
