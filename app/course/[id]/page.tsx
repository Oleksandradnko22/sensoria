export default async function CoursePage({
  params,
}: {
  params: { id: string }
}) {
  const courses = [
    {
      id: "1",
      title: "Тривога під контролем",
      description: "Цей курс допоможе тобі краще зрозуміти свою тривожність.",
      video: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      pdf: "/3-min.pptx.pdf",
    },
    {
      id: "2",
      title: "Самооцінка та впевненість",
      description: "Побудуй здорову самооцінку.",
      video: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      pdf: "/3-min.pptx.pdf",
    },
  ]

  const course = courses.find((c) => c.id === params.id)

  if (!course) {
    return <div className="p-6">Курс не знайдено</div>
  }

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-3xl font-bold mb-4">{course.title}</h1>

      <p className="text-gray-600 mb-6">{course.description}</p>

      <div className="mb-6">
        <iframe
          width="100%"
          height="400"
          src={course.video}
          title="Video"
          allowFullScreen
        />
      </div>

      <a
        href={course.pdf}
        className="inline-block bg-black text-white px-6 py-3 rounded-xl"
      >
        Завантажити PDF
      </a>
    </main>
  )
}
