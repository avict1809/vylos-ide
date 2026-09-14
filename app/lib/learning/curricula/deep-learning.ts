import { CourseDefinition } from '../types';
import { AI_ACCURACY_GUIDELINES } from './guidelines';

export const deepLearning: CourseDefinition = {
    id: 'deep-learning',
    title: 'Deep Learning with PyTorch',
    tagline: 'Build, train, and debug neural networks, from tensors to a tiny transformer.',
    level: 'Intermediate → Advanced (Python + basic ML)',
    hours: 40,
    accent: '#EE4C2C',
    badge: 'DL',
    category: 'ai',
    stack: 'Python',
    tutorGuidelines: [
        ...AI_ACCURACY_GUIDELINES,
        'Check for PyTorch with python3 -c "import torch; print(torch.__version__, torch.cuda.is_available())". Assume CPU unless that says a GPU is available.',
        'Datasets and pretrained weights (torchvision) are downloaded from the internet. Tell the learner roughly what will be downloaded before running such code.',
        'Print tensor shapes often. Most deep learning bugs are shape bugs, so teach the learner to check shapes themselves.',
    ],
    modules: [
        {
            title: 'Tensors & Setup',
            description: 'The core data structure of deep learning.',
            lessons: [
                'Installing PyTorch (CPU build) in a virtual environment',
                'Creating tensors',
                'Tensor operations and matrix multiplication',
                'Shapes, reshaping, and broadcasting',
                'Devices: CPU vs GPU',
                'Converting between NumPy and PyTorch',
            ],
        },
        {
            title: 'Autograd & Gradient Descent',
            description: 'How PyTorch computes gradients for you.',
            lessons: [
                'requires_grad and the computation graph',
                'Calling backward() and reading gradients',
                'Gradient descent by hand',
                'Linear regression from scratch with autograd',
                'Optimizers: SGD and Adam',
            ],
        },
        {
            title: 'Building Neural Networks',
            description: 'Models, losses, and the training loop.',
            lessons: [
                'nn.Module and layers',
                'Activation functions',
                'Loss functions for regression and classification',
                'The training loop step by step',
                'The evaluation loop and model.eval()',
                'Exercise: a multilayer perceptron classifier',
            ],
        },
        {
            title: 'Data Pipelines',
            description: 'Feed data to your models efficiently.',
            lessons: [
                'Dataset and DataLoader',
                'Batching and shuffling',
                'Transforms',
                'Loading built-in datasets (FashionMNIST)',
                'Writing a custom Dataset',
            ],
        },
        {
            title: 'Training Well',
            description: 'Get models that generalize instead of memorizing.',
            lessons: [
                'Diagnosing overfitting with loss curves',
                'Dropout',
                'Batch normalization',
                'Weight decay',
                'Learning rate and schedulers',
                'Early stopping',
                'Saving and loading checkpoints',
            ],
        },
        {
            title: 'Convolutional Neural Networks',
            description: 'Networks that see.',
            lessons: [
                'Convolutions: filters and feature maps',
                'Pooling and stride',
                'Building a CNN for FashionMNIST',
                'Data augmentation',
                'Visualizing what a CNN learns',
            ],
        },
        {
            title: 'Transfer Learning',
            description: 'Stand on the shoulders of pretrained models.',
            lessons: [
                'Why pretrained models work',
                'Loading a pretrained model from torchvision',
                'Feature extraction: freezing layers',
                'Fine-tuning',
                'Exercise: classify your own small image set',
            ],
        },
        {
            title: 'Sequence Models',
            description: 'Networks for text and time series.',
            lessons: [
                'Tokenization and embeddings',
                'Recurrent neural networks',
                'LSTMs and GRUs',
                'Exercise: text sentiment classifier',
            ],
        },
        {
            title: 'Attention & Transformers',
            description: 'The architecture behind modern language models, built piece by piece.',
            lessons: [
                'Self-attention from scratch',
                'Multi-head attention',
                'Positional encodings',
                'The transformer block',
                'Exercise: a tiny character-level language model',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'Train, debug, and present a deep learning model end to end.',
            lessons: [
                'Choosing a project that fits your hardware',
                'Building the data pipeline',
                'Training a baseline',
                'Improving and debugging',
                'Evaluating and presenting results honestly',
            ],
        },
    ],
};
