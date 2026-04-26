export default function Catalog() {
  const courses = [
    {
      id: 1,
      title: "Тривога під контролем",
      description: "Навчись працювати зі своєю тривожністю",
    },
    {
      id: 2,
      title: "Самооцінка та впевненість",
      description: "Побудуй здорову самооцінку",
    },
  ]

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-3xl font-bold mb-6">Каталог курсів</h1>

      <div className="grid gap-4">
        {courses.map((course) => (
          <a
            key={course.id}
            href={`/course/${course.id}`}
            className="block p-4 border rounded-xl"
          >
            <h2 className="text-xl font-semibold">
              {course.title}
            </h2>
            <p className="text-gray-600">
              {course.description}
            </p>
          </a>
        ))}
      </div>
    </main>
  )
}
