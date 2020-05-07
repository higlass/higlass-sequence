#!/usr/bin/python

from Bio import SeqIO
import pprint
import h5py
import numpy as np
import sys
import argparse

#  TODO create an h5py file, then write to the file instead of placing inside aggregated_dict.
#  TODO h5py files have 'groups' which are files that together act like key value pairs in a dictionary.
#  TODO use these to do dictionary


def sequence_to_array(fasta_file):
    """
    Convert a genomic sequence to a dictionary of 5xn arrays of
    nucleotides.
    Parameters:
    -----------
    fasta_file: string
        The name of the fasta file that we wish to extract the sequence
        from
    Returns
    -------
    sequence_arrays: {'sequence_name': [[0,1,0,0,0]...]...}
        A dictionary indexed by the sequence names containing 5xn arrays
        where the position of the letter is 1 and the other values are 0
    """
    f = h5py.File("aggregated_dict.hdf5", "w")  # root group
    record_dict = SeqIO.to_dict(SeqIO.parse(fasta_file, "fasta"))
    print("Reading fasta file complete.")
    # aggregated_dict = {}

    for key in record_dict.keys():
        sequence = record_dict[key]
        temporary_array = []
        sequence_length = len(str(sequence.seq))
        print("Sequence length: {0:d}".format(sequence_length))

        printProgressBar(0, sequence_length, prefix = 'Progress:', suffix = 'Complete', length = 50)
        # order: [A, T, G, C, N, Other]
        for i in range(0, sequence_length):
            printProgressBar(i+1, sequence_length, prefix = 'Progress:', suffix = 'Complete', length = 50)
            letter = str(sequence.seq)[i]
            if (letter == 'A') | (letter == 'a'):
                temporary_array.append([1, 0, 0, 0, 0, 0])
            elif (letter == "T") | (letter == "t"):
                temporary_array.append([0, 1, 0, 0, 0, 0])
            elif (letter == "G") | (letter == "g"):
                temporary_array.append([0, 0, 1, 0, 0, 0])
            elif (letter == "C") | (letter == "c"):
                temporary_array.append([0, 0, 0, 1, 0, 0])
            elif (letter == "N") | (letter == "n"):
                temporary_array.append([0, 0, 0, 0, 1, 0])
            else:
                temporary_array.append([0, 0, 0, 0, 0, 1])
        print("Writing to hdf5 file")
        #nucleotide_array[:] = temporary_array
        nucleotide_array = f.create_dataset(str(key), (len(str(sequence.seq)), 6), "i", data=temporary_array, compression='gzip')  # is value in dict

    f.close()

    #     aggregated_dict[sequence.id] = nucleotide_array
    #
    # pprint.pprint(aggregated_dict)

# Print iterations progress
def printProgressBar (iteration, total, prefix = '', suffix = '', decimals = 1, length = 100, fill = '█', printEnd = "\r"):
    """
    Call in a loop to create terminal progress bar
    @params:
        iteration   - Required  : current iteration (Int)
        total       - Required  : total iterations (Int)
        prefix      - Optional  : prefix string (Str)
        suffix      - Optional  : suffix string (Str)
        decimals    - Optional  : positive number of decimals in percent complete (Int)
        length      - Optional  : character length of bar (Int)
        fill        - Optional  : bar fill character (Str)
        printEnd    - Optional  : end character (e.g. "\r", "\r\n") (Str)
    """

    if (iteration % 1000000 == 0) | (iteration == total):
        percent = ("{0:." + str(decimals) + "f}").format(100 * (iteration / float(total)))
        filledLength = int(length * iteration // total)
        bar = fill * filledLength + '-' * (length - filledLength)
        print('\r%s |%s| %s%% %s' % (prefix, bar, percent, suffix), end = printEnd)
    # Print New Line on Complete
    if iteration == total: 
        print()


def main():
    parser = argparse.ArgumentParser(description="""description""")
    parser.add_argument('fasta_file')
    args = parser.parse_args()
    sequence_to_array(args.fasta_file)


if __name__ == '__main__':  # if inside terminal this gets called. if in python interpreter call main directly
    main()