export const DeveloperListSkeleton = () => {
    return (
        <div className="space-y-4">
            {[...Array(3)].map((_, index) => (
                <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-blue-400">
                    <div className="float-right inline-block w-fit rounded-full bg-zinc-700 px-2 py-1 text-xs text-transparent">
                        xxxxxxxxxx
                    </div>
                    <div className="mb-1 w-fit rounded-md bg-zinc-700 text-lg text-transparent">
                        xxxx xxxxxxxx
                    </div>
                    <div className="w-fit rounded-md bg-zinc-700 text-xl font-bold text-transparent">
                        xxxxxxxxxxxxxx
                    </div>
                    <div className="mt-2 flex space-x-2">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="rounded-md bg-zinc-700 px-2 py-1 text-xs text-transparent">
                                xxxxxxx
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 w-1/4 rounded-md bg-zinc-700 text-sm text-transparent">
                        xxxxxx xxxxx: xx
                    </div>
                </div>
            ))}
        </div>
    )
}