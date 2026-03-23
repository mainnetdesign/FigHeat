import { FigHeatLayout } from '@/components/cv/figheat-layout';

export const metadata = {
    title: 'FigHeat - CV Heatmap Explorer',
    description: 'Analyze images with AI by Mainnet Design',
};

export default function ComputerVisionPage() {
    return (
        <main className="min-h-screen">
            <FigHeatLayout />
        </main>
    );
}
