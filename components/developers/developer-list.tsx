'use client'
import React, { useState } from 'react';

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
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const toggleExpand = (index: number) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    return (
        <div className="space-y-4">
            {developers.map((developer, index) => (
                <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-blue-400">
                    <div className="float-right inline-block w-fit rounded-full bg-green-700 px-2 py-1 text-xs text-white font-bold">
                        Score: {developer.average_score}
                    </div>
                    <div className="mb-1 w-fit text-lg font-semibold">
                        <a href={developer.user_url} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">
                            @{developer.user_url.split('/').pop()}
                        </a>
                    </div>
                    <div className="w-fit text-sm">
                        <a href={developer.repo_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                            📁 {developer.repo_url.split('/').pop()}
                        </a>
                    </div>
                    <div className="mt-2 text-sm text-gray-300">
                        {developer.summary.slice(0, 100)}...
                        <button
                            onClick={() => toggleExpand(index)}
                            className="ml-2 text-blue-400 hover:underline focus:outline-none"
                        >
                            {expandedIndex === index ? 'Show Less' : 'Show More'}
                        </button>
                    </div>
                    {expandedIndex === index && (
                        <div className="mt-2 text-sm text-gray-300 bg-zinc-900 p-2 rounded">
                            {developer.summary}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};