import React from 'react';

interface Developer {
    average_score: number;
    analysis_rate: number;
    repo_url: string;
    user_url: string;
    summary: string;
}

interface DeveloperListProps {
    developers: Developer[];
}

export const DeveloperList: React.FC<DeveloperListProps> = ({ developers }) => {
    return (
        <div className="space-y-4">
            {developers.map((developer, index) => (
                <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-blue-400">
                    <div className="float-right inline-block w-fit rounded-full bg-zinc-700 px-2 py-1 text-xs">
                        Score: {developer.average_score}
                    </div>
                    <div className="mb-1 w-fit text-lg font-semibold">
                        <a href={developer.user_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {developer.user_url.split('/').pop()}
                        </a>
                    </div>
                    <div className="w-fit text-sm">
                        <a href={developer.repo_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {developer.repo_url.split('/').pop()}
                        </a>
                    </div>
                    <div className="mt-2 text-sm">
                        Analysis Rate: {(developer.analysis_rate * 100).toFixed(2)}%
                    </div>
                    <div className="mt-2 text-sm">
                        {developer.summary}
                    </div>
                </div>
            ))}
        </div>
    );
};